-- =============================================================================
-- Knockout (Round-of-32) migration — RUN THIS ONCE in Supabase → SQL Editor.
-- Additive and idempotent: safe to run on the live database without wiping data.
--
-- The knockout columns below were mostly added already (see CLAUDE.md prereqs):
--   matches.stage / et_score_a / et_score_b / pen_winner_team_id
--   predictions.pred_et_a / pred_et_b / pred_pen_winner_team_id
-- They are repeated here with `if not exists` so this file fully documents the
-- knockout schema and can be re-run safely. The NEW columns this task requires
-- are the two `is_et` flags at the bottom.
-- =============================================================================

-- ---- matches: knockout result fields ----
alter table public.matches
  add column if not exists stage text not null default 'group';
alter table public.matches
  add column if not exists et_score_a int;          -- ACTUAL extra-time total (incl. FT goals)
alter table public.matches
  add column if not exists et_score_b int;
alter table public.matches
  add column if not exists pen_winner_team_id bigint references public.teams(id);

-- ---- predictions: knockout prediction fields ----
alter table public.predictions
  add column if not exists pred_et_a int;            -- PREDICTED extra-time total
alter table public.predictions
  add column if not exists pred_et_b int;
alter table public.predictions
  add column if not exists pred_pen_winner_team_id bigint references public.teams(id);

-- ---- NEW: distinguish extra-time goals / scorer picks from full-time ones ----
-- match_goals.is_et = true  → goal scored during extra time.
-- prediction_scorers.is_et = true → an ET scorer pick (scored against ET goals).
alter table public.match_goals
  add column if not exists is_et boolean not null default false;
alter table public.prediction_scorers
  add column if not exists is_et boolean not null default false;
