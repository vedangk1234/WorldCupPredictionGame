# CLAUDE.md — World Cup 2026 Prediction Game (Project Bible)

> This file is the single source of truth for the project. Read it first before
> changing anything. Every meaningful change gets logged in the **Changelog** at
> the bottom. Keep it accurate.

---

## 1. What this is

A private predictions game for a group of friends, for the **FIFA World Cup 2026
group stage** (72 matches, 12 groups A–L, 48 teams). Each player predicts the
**scoreline** and optionally the **goal scorers** of each match. Points are
awarded after each match finishes; a global leaderboard ranks everyone.

- **Hosting:** Vercel
- **Database/Auth:** Supabase (project ref `ublhpyyaoapoytylrlvs`)
- **Code:** Next.js (App Router) + TypeScript + Tailwind
- **Repo:** `github.com/vedangk1234/WorldCupPredictionGame` (private)
- **Timezone:** Everything displayed in **IST (Asia/Kolkata)**. No localization.
- **No money involved.** Friends-only. Slight delays in entering results are fine.

---

## 2. Core rules (the contract — do not change without updating this section)

### 2.1 Scoring (per match, per user)

Points are **additive**. There is **no concept of home/away** anywhere in the app —
matches are always "Team A vs Team B", shown by name only.

**Decisive match (someone wins):**

| Prediction outcome | Points |
|---|---|
| Exact score | **9** (exact +5, winner +3, margin +1 all stack) |
| Correct winner + correct winning margin, wrong score | **4** (+3 +1) |
| Correct winner, wrong margin | **3** |
| Wrong winner | **0** |

**Drawn match:**

| Prediction outcome | Points |
|---|---|
| Exact draw (e.g. predict 1–1, actual 1–1) | **6** (exact +5, GD-of-0 +1) |
| Predicted a draw, wrong score (e.g. predict 1–1, actual 2–2) | **1** (GD 0 matches) |
| Predicted a winner | **0** |

- **Winner (+3):** awarded ONLY in a decisive match when you predicted the
  correct winning side. A draw never awards the winner point.
- **Goal difference / margin (+1):** awarded only if the winner is also correct
  AND the exact winning margin matches. (SK 2–1 ↔ predict 3–2 → both margin 1 → +1.)
  For a draw, the margin is 0, so any correct-draw prediction earns this +1.
- **Exact score (+5):** the precise scoreline. Stacks with winner and margin.

### 2.2 Goal scorers

- **+2 for every goal a correctly-named player actually scores.** A brace = +4,
  a hat-trick = +6. The user names each player **once**; the per-goal multiplier
  is applied automatically from the real result.
- Scorer points are **independent of the scoreline** — you earn them even if your
  winner/score is wrong.
- **Cap:** a user may name **0 up to (total goals in their predicted score)**
  distinct players, in any mix of the two teams. Predict 2–1 → up to 3 picks.
  Optional — naming zero is allowed.
- **Own goals credit nobody** with scorer points. BUT if a user named a player to
  score and that player instead scored an **own goal**, the user gets **−1 per own
  goal** by that player (netted with any normal goals the same player scored).

### 2.3 Underdog bonus

- The admin designates an underdog on **some** matches (not all), on **either** team.
- **+5** is awarded only if: the match has a designated underdog **AND** that
  underdog actually **wins** **AND** the user predicted that underdog to win.
- No bonus if the underdog draws or loses. Stacks on top of everything else.
- The prediction card shows a visible tag, e.g. "⚡ Underdog — Curaçao · back them
  to win for +5".

### 2.4 Locking, deadlines & reveal

- Each match has a **kickoff time (IST)** and a **predictions-close time**
  (default = kickoff − 5 minutes; admin can edit).
- A user edits their prediction freely until they press **"Lock in Prediction"**.
- Locking triggers a confirm dialog ("You can't edit this after locking — sure?").
  On confirm the prediction is **permanent** (no further edits).
- **Reveal rule:** a user can see other people's predictions for a match **only
  after** (a) they have locked their own prediction for that match, **or**
  (b) the match's predictions-close time has passed. Until then, others' picks are
  hidden. This is what prevents copying.
- If a user has not locked by the close time, they are **out of that match**
  (0 points, shown as "—"). No locking after close. **All timing is enforced
  server-side** — never trust the client clock.

### 2.5 Leaderboards

- **Match leaderboard** (under each match): per-user **points breakdown**
  (Winner / GD / Exact / Scorers / Underdog → match total). Clicking a user opens
  their predicted scoreline + the scorers they backed.
- **Total leaderboard** (right side on desktop, tab/collapsible on mobile):
  cumulative, ranked by **total points**, highest first. Shows **Name (username)**.
  The category columns are **counts** (how many exacts, winners, etc.) — they are
  bragging stats and deliberately do **not** sum to the points total (different
  units: counts vs points).

### 2.6 Match display states

- **Scheduled:** predictions open (until close time).
- **Locked / awaiting result:** past close time, no result yet → predictions frozen
  and visible, not greyed.
- **Finished:** admin entered a result → match is greyed out (still clickable to
  view), points recomputed, next match highlighted.

---

## 3. Auth

- **Supabase Auth**, email/password under the hood.
- The signup form collects **Name, Username, Password, Confirm Password** — there
  is **no email field shown to the user**. Internally the app maps the username to a
  synthetic email `‹username›@wc.local` that users never see or type.
- Passwords are hashed by Supabase. Sessions are cookie-based (via `@supabase/ssr`)
  so users are **auto-logged-in on return visits**.
- Admin is a single flag `profiles.is_admin`. Set it manually once (see SETUP.md).

---

## 4. Data model (Supabase Postgres)

Defined in `supabase/schema.sql`. Summary:

- **profiles** — `id` (=auth.users.id), `name`, `username` (unique), `is_admin`.
- **teams** — `name`, `code`, `group_letter`, `flag_url`.
- **players** — `team_id`, `name`, `position` (GK/DEF/MID/FWD), `shirt_number`.
- **matches** — `team_a_id`, `team_b_id`, `group_letter`, `matchday`, `kickoff_at`,
  `predictions_close_at`, `underdog_team_id`, `score_a`, `score_b`, `finished`.
  (`team_a`/`team_b` carry **no** home/away meaning; just two slots.)
- **match_goals** — actual scorers, **one row per goal** (a brace = two rows):
  `match_id`, `player_id`, `minute` (text, display-only — does NOT affect scoring),
  `is_own_goal`.
- **predictions** — `user_id`, `match_id`, `score_a`, `score_b`, `locked`,
  `locked_at`. Unique on (`user_id`, `match_id`).
- **prediction_scorers** — `prediction_id`, `player_id`.
- **prediction_points** — computed per prediction: `winner_pts`, `gd_pts`,
  `exact_pts`, `scorer_pts`, `underdog_pts`, `total_pts`, plus boolean/count flags
  for the leaderboard count columns.
- **leaderboard** — a VIEW aggregating `prediction_points` per user.

RLS is ON for every table. Key policies:
- Everyone (authenticated) can read teams/players/matches/match_goals.
- Only admins can write teams/players/matches/match_goals/prediction_points.
- Users can insert/update their **own** prediction only while the match is open.
- Users can read a prediction if it's their own, OR they've locked their own for
  that match, OR the match close time has passed (the reveal rule).

---

## 5. Scoring engine

Pure function in `lib/scoring.ts` (added in Phase 2). It takes a prediction + the
actual match result (score + scorers + underdog) and returns the full points
breakdown per section 2. The admin "Mark finished" action loads all predictions for
the match, runs this function, and upserts `prediction_points`. Recomputation is
**idempotent** — re-running on a corrected result just overwrites the breakdown.

---

## 6. Build phases

1. **Phase 1 — Foundation & manual setup (this delivery):** scaffold, schema,
   `CLAUDE.md`, `SETUP.md`. You: create Supabase project, run schema, set env vars,
   push to GitHub, deploy to Vercel, make yourself admin.
2. **Phase 2 — Admin panel:** seed data (teams, squads, 72 fixtures), match CRUD,
   underdog control, result + scorer + own-goal entry, scoring engine, "mark
   finished" recompute.
3. **Phase 3 — User pages:** signup/login, prediction cards (score + scorer picks +
   underdog tag), lock/confirm/reveal flow, match leaderboards, total leaderboard,
   World-Cup-y theme.

---

## 7. Design direction

- Dark "stadium at night" base; **pitch green** + **gold** accents echoing the
  official FWC 2026 identity; a **multicolour stripe** motif as the signature
  (nods to the multicolour "26"). Avoid generic cream/serif or single-acid-accent looks.
- **Body font:** Noto Sans (FIFA 2026's real free secondary font).
- **Display font:** a bold, broadcast-style sans for headings and the scoreboard
  numerals (the proprietary FWC 2026 face can't be embedded legally).
- Rules pinned at the top of the user page; matches listed below; finished = greyed.

---

## 8. Known risks / honesty notes

- **Squad accuracy (~95%):** the ~1,248 players are scraped from public sources
  (final squads were announced after the model's knowledge cutoff). Expect a few
  spelling issues or a missed late injury replacement. The admin panel's
  add/edit/delete-player feature is the safety net; picks are by player **ID**, so a
  corrected name propagates everywhere with no mismatch risk.
- **Tournament already underway** (started 11 Jun 2026): any group match already
  finished before deployment simply won't be predictable; the board starts from
  whatever's still upcoming.

---

## Changelog

- **Phase 1 (initial):** Project scaffold (Next.js + TS + Tailwind + Supabase SSR
  client), full `supabase/schema.sql` with RLS, `CLAUDE.md`, `SETUP.md`, placeholder
  landing page that verifies the Supabase connection. No app features yet.
- **Phase 2 (seed data):** Added `scripts/build-seed.mjs` (Node 18+, no deps) that
  fetches the public-domain openfootball/worldcup.json 2026 dataset and generates
  `supabase/seed.sql` — **48 teams, 1245 players, 72 group-stage fixtures**. Kickoff
  times are converted from their local UTC offset to UTC; close time = kickoff − 5 min.
  Rows join to teams by name (id-independent) and are deterministically ordered.
  Run the SQL in the Supabase SQL Editor after `schema.sql`. Re-runnable.
- **Phase 2 (scoring engine):** Added `lib/scoring.ts` — a single pure function
  `scorePrediction(ScoringInput): ScoringResult` implementing section 2 exactly
  (winner / GD / exact / scorers-with-own-goal-netting / underdog, no clamping,
  no I/O). Added `scripts/test-scoring.ts` (run via `npm run test:scoring`, `tsx`
  devDependency) — a 16-case self-verifying suite covering decisive/draw/exact,
  scorer braces, own-goal penalties and netting, and underdog wins; all 16 pass.
  Also fixed a stale section 2.1 bullet that wrongly said a draw awards the winner
  point (it never does).
- **Phase 2 (admin panel — complete):** Added the admin-only area under `app/admin`.
  `lib/auth.ts → requireAdmin()` loads the user server-side, checks `profiles.is_admin`,
  and redirects to `/` otherwise; every admin page and every write calls it first
  (client never trusted). `lib/format.ts → fmtIST/fmtISTTime` render all times in IST
  (Asia/Kolkata). `/admin` lists all 72 matches grouped A–L with IST kickoff/close times
  and a server-computed state badge — **Open** / **Locked · awaiting result** / **Finished**
  (finished rows dimmed) — plus an underdog indicator and final score. `/admin/match/[id]`
  has the underdog control (Team A / Team B / none) and a result-entry form: score inputs,
  one-row-per-goal scorers (player dropdown grouped by team + shirt #, minute note, own-goal
  checkbox) with a soft "goals ≠ score" warning. Server actions in `app/admin/actions.ts`:
  `setUnderdog`, `saveResult` (draft — upserts score, replaces `match_goals`), `finishMatch`
  (sets finished + recomputes), and `recomputePoints` (recompute without re-finishing). The
  recompute deletes `prediction_points` for the match then re-runs `scorePrediction` over
  every prediction and re-inserts (idempotent). **Unlocked predictions are skipped** (an
  unlocked prediction = the user is out of that match, per 2.4) — only `locked = true` rows
  get a points row. Notes/limitations: goals are stored **aggregated** by
  `(player_id, is_own_goal)` into `match_goals.count` (the schema is unique on that triple),
  and the per-goal **minute is UI-only / not persisted** — the schema has no minute column
  and was not changed. Set `tsconfig` `target: es2017` so the `Set`/`Map` spreads in the
  (unchanged) scoring engine compile under Next's build.
- **Phase 2 (match_goals migration — applied):** Reshaped `match_goals` from an
  aggregated `count` column + `unique(match_id, player_id, is_own_goal)` to **one row
  per goal** with a persisted `minute text` (display-only — does NOT affect scoring) and
  a `created_at`; dropped the `count`/unique constraint. Safe because no predictions or
  results existed yet. Updated `supabase/schema.sql` (and the root duplicate `schema.sql`),
  `lib/types.ts` (`MatchGoal.count` → `minute: string | null`), the admin match page (loads
  rows directly, prefilling each goal's minute) and `saveResult` (deletes then inserts one
  `{match_id, player_id, minute, is_own_goal}` row per goal — empty minute stored as null).
  The recompute now maps each row straight to `{playerId, isOwnGoal}`, so a player's two
  rows = two goals and **points are unchanged** (scoring engine untouched; all 16 tests
  pass). `ResultForm` relabels the minute input as a normal "Minute (optional)" field.
  RLS policies on `match_goals` were left as-is. **Re-run** `supabase/schema.sql` then
  `supabase/seed.sql` in Supabase to apply (drops & recreates — fine, no game data yet).
- **Phase 3 section 1 (auth — signup / login / logout / auto-login):** Added the
  user-facing auth flow. `lib/username.ts` is the single source of truth for the
  username↔synthetic-email mapping (`AUTH_EMAIL_DOMAIN = "wc.local"`, `normalizeUsername`
  = trim+lowercase, `usernameToEmail`, `validateUsername` 3–20 of `[a-z0-9_]`, `validateName`
  1–40). `app/signup/page.tsx` (client, browser Supabase client) collects **Name, Username,
  Password, Confirm** — **no email field** — with inline validation, calls `auth.signUp`
  passing `options.data.name`/`username` (the existing `handle_new_user()` trigger reads
  those into `profiles`); duplicate → "That username is taken", no-session → a "turn off
  Confirm email" diagnostic, success+session → `/` + refresh. `app/login/page.tsx` (client)
  takes username+password → `auth.signInWithPassword({ email: usernameToEmail(...) })`,
  bad creds → "Wrong username or password." Logout is a server action in
  `app/auth-actions.ts` (`signOut()` → server client `auth.signOut()` → `redirect("/")`),
  wired to a form button. `app/components/SiteHeader.tsx` (server) reads the user + profile
  and shows the wordmark + (logged-out) Log in / Create account, or (logged-in) "Hi, {name}",
  logout, and an **Admin** link only when `is_admin`. `app/page.tsx` replaced the Phase-1
  setup-check placeholder with an auth-aware home (hero + CTAs logged-out; greeting + "Make
  Predictions"/"Leaderboard" logged-in). Added placeholder `app/predictions` and
  `app/leaderboard` pages ("Coming in the next update.") so nothing dead-links. Updated
  SETUP.md step 7 (admin can be flipped now). **No schema, scoring-engine, or admin-panel
  changes**; `npm run build` clean and all 16 scoring tests pass.
