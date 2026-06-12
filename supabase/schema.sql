-- =============================================================================
-- World Cup 2026 Prediction Game — Database schema
-- Run this in Supabase → SQL Editor (paste the whole file, click Run).
-- Safe to re-run: it drops and recreates objects. (It will wipe game data.)
-- =============================================================================

-- ---------- Extensions -------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------- Clean slate (idempotent) ----------------------------------------
drop view   if exists public.leaderboard cascade;
drop table  if exists public.prediction_points cascade;
drop table  if exists public.prediction_scorers cascade;
drop table  if exists public.predictions cascade;
drop table  if exists public.match_goals cascade;
drop table  if exists public.matches cascade;
drop table  if exists public.players cascade;
drop table  if exists public.teams cascade;
drop table  if exists public.profiles cascade;

-- =============================================================================
-- PROFILES  (1:1 with auth.users)
-- =============================================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  username    text not null unique,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up.
-- The signup flow stores name + username in user metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Player'),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: is the current user an admin?  (security definer avoids RLS recursion)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- =============================================================================
-- TEAMS
-- =============================================================================
create table public.teams (
  id            bigint generated always as identity primary key,
  name          text not null unique,
  code          text,                       -- FIFA 3-letter code, e.g. ARG
  group_letter  text,                        -- 'A'..'L'
  flag_url      text,
  created_at    timestamptz not null default now()
);

-- =============================================================================
-- PLAYERS
-- =============================================================================
create table public.players (
  id            bigint generated always as identity primary key,
  team_id       bigint not null references public.teams(id) on delete cascade,
  name          text not null,
  position      text check (position in ('GK','DEF','MID','FWD')),
  shirt_number  int,
  created_at    timestamptz not null default now()
);
create index players_team_idx on public.players(team_id);

-- =============================================================================
-- MATCHES   (team_a / team_b carry NO home-away meaning — just two slots)
-- =============================================================================
create table public.matches (
  id                    bigint generated always as identity primary key,
  team_a_id             bigint not null references public.teams(id),
  team_b_id             bigint not null references public.teams(id),
  group_letter          text,
  matchday              int,
  kickoff_at            timestamptz not null,           -- stored UTC, shown IST
  predictions_close_at  timestamptz not null,           -- default kickoff - 5 min
  underdog_team_id      bigint references public.teams(id),  -- null = no underdog
  score_a               int,                            -- null until finished
  score_b               int,
  finished              boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (team_a_id <> team_b_id),
  check (underdog_team_id is null
         or underdog_team_id = team_a_id
         or underdog_team_id = team_b_id)
);
create index matches_kickoff_idx on public.matches(kickoff_at);

-- =============================================================================
-- MATCH_GOALS   (actual scorers entered by admin)
--   For an own goal, player_id is the OPPOSING player; the goal counts for the
--   team that benefited. is_own_goal flags it.
-- =============================================================================
-- One row PER GOAL. A brace = two rows. Scoring counts rows per player;
-- `minute` is recorded for display only and does NOT affect points.
create table public.match_goals (
  id           bigint generated always as identity primary key,
  match_id     bigint not null references public.matches(id) on delete cascade,
  player_id    bigint not null references public.players(id),
  minute       text,                       -- e.g. '23', '45+2', '90+4'
  is_own_goal  boolean not null default false,
  created_at   timestamptz not null default now()
);
create index match_goals_match_idx on public.match_goals(match_id);

-- =============================================================================
-- PREDICTIONS   (one per user per match)
-- =============================================================================
create table public.predictions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  match_id    bigint not null references public.matches(id) on delete cascade,
  score_a     int not null check (score_a >= 0),
  score_b     int not null check (score_b >= 0),
  locked      boolean not null default false,
  locked_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, match_id)
);
create index predictions_match_idx on public.predictions(match_id);

-- Helper: has the current user LOCKED their own prediction for a match?
-- security definer = bypasses RLS on predictions, which is what breaks the
-- otherwise-infinite recursion in the predictions SELECT reveal policy.
-- Defined here (after the table exists) because a `language sql` body is
-- validated at creation time.
create or replace function public.has_locked_prediction(p_match_id bigint)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.predictions
    where match_id = p_match_id
      and user_id = auth.uid()
      and locked = true
  );
$$;

-- =============================================================================
-- PREDICTION_SCORERS   (which players a user backed to score)
-- =============================================================================
create table public.prediction_scorers (
  id             bigint generated always as identity primary key,
  prediction_id  bigint not null references public.predictions(id) on delete cascade,
  player_id      bigint not null references public.players(id),
  unique (prediction_id, player_id)
);

-- =============================================================================
-- PREDICTION_POINTS   (computed after a match finishes)
-- =============================================================================
create table public.prediction_points (
  prediction_id    bigint primary key references public.predictions(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  match_id         bigint not null references public.matches(id) on delete cascade,
  winner_pts       int not null default 0,
  gd_pts           int not null default 0,
  exact_pts        int not null default 0,
  scorer_pts       int not null default 0,
  underdog_pts     int not null default 0,
  total_pts        int not null default 0,
  -- count flags for the leaderboard "stats" columns
  got_winner       boolean not null default false,
  got_gd           boolean not null default false,
  got_exact        boolean not null default false,
  correct_scorers  int not null default 0,
  got_underdog     boolean not null default false,
  computed_at      timestamptz not null default now()
);
create index prediction_points_user_idx on public.prediction_points(user_id);

-- =============================================================================
-- LEADERBOARD VIEW  (total points + bragging-rights counts per user)
-- =============================================================================
create view public.leaderboard
with (security_invoker = true) as
select
  p.id            as user_id,
  p.name,
  p.username,
  coalesce(sum(pp.total_pts), 0)        as total_pts,
  coalesce(sum(pp.got_winner::int), 0)  as winners_count,
  coalesce(sum(pp.got_gd::int), 0)      as gd_count,
  coalesce(sum(pp.got_exact::int), 0)   as exact_count,
  coalesce(sum(pp.correct_scorers), 0)  as scorers_count,
  coalesce(sum(pp.got_underdog::int), 0) as underdog_count
from public.profiles p
left join public.prediction_points pp on pp.user_id = p.id
group by p.id, p.name, p.username;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.profiles            enable row level security;
alter table public.teams               enable row level security;
alter table public.players             enable row level security;
alter table public.matches             enable row level security;
alter table public.match_goals         enable row level security;
alter table public.predictions         enable row level security;
alter table public.prediction_scorers  enable row level security;
alter table public.prediction_points   enable row level security;

-- ---- profiles ----
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);
create policy "users update own profile (not is_admin)"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and is_admin = (select is_admin from public.profiles where id = auth.uid()));

-- ---- reference data: read for all authenticated, write for admins ----
create policy "teams read"   on public.teams   for select to authenticated using (true);
create policy "teams admin"  on public.teams   for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "players read" on public.players for select to authenticated using (true);
create policy "players admin" on public.players for all   to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "matches read" on public.matches for select to authenticated using (true);
create policy "matches admin" on public.matches for all   to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "goals read"   on public.match_goals for select to authenticated using (true);
create policy "goals admin"  on public.match_goals for all  to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- predictions: own writes only while the match is open ----
drop policy if exists "predictions read own-or-revealed" on public.predictions;
create policy "predictions read own-or-revealed"
  on public.predictions for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_locked_prediction(match_id)          -- reveal: I've locked mine
    or exists (  -- reveal: predictions have closed for this match
      select 1 from public.matches m
      where m.id = predictions.match_id
        and m.predictions_close_at <= now()
    )
  );

create policy "predictions insert own while open"
  on public.predictions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.matches m
                where m.id = match_id and m.predictions_close_at > now())
  );

create policy "predictions update own while open and unlocked"
  on public.predictions for update to authenticated
  using (
    user_id = auth.uid()
    and locked = false
    and exists (select 1 from public.matches m
                where m.id = match_id and m.predictions_close_at > now())
  )
  with check (user_id = auth.uid());

-- ---- prediction_scorers: visible/writable in step with the parent prediction ----
create policy "scorers read"
  on public.prediction_scorers for select to authenticated
  using (exists (select 1 from public.predictions pr
                 where pr.id = prediction_id));  -- parent's RLS already gates visibility
create policy "scorers write own while open"
  on public.prediction_scorers for all to authenticated
  using (exists (select 1 from public.predictions pr
                 where pr.id = prediction_id and pr.user_id = auth.uid() and pr.locked = false))
  with check (exists (select 1 from public.predictions pr
                 where pr.id = prediction_id and pr.user_id = auth.uid() and pr.locked = false));

-- ---- prediction_points: readable by all; only admins write (via recompute) ----
create policy "points read" on public.prediction_points for select to authenticated using (true);
create policy "points admin" on public.prediction_points for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- Done. Next: Phase 2 adds the seed data (teams, players, fixtures) and the
-- scoring/recompute logic that fills prediction_points.
-- =============================================================================
