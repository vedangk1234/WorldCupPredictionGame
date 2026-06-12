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
- **Admin patch (chronological list, flag emojis, one-step Save & compute):** Edits the
  admin panel only — **no schema, scoring-engine, or user-page changes**. `/admin` now
  renders ONE flat list of all 72 matches ordered by `kickoff_at` ascending (the A–L group
  grouping is gone); each row keeps its content (teams, group + matchday metadata, IST
  kickoff/close, state badge, underdog hint, final score), finished rows dimmed,
  locked-awaiting-result rows highlighted. Team names across both admin pages now show the
  **country flag emoji from `teams.flag_url`** (which stores the emoji, e.g. "🇧🇷") before the
  name — no `<img>` (the old `<img src={flag_url}>` was replaced); null/empty flag → name
  only. The result-entry form's three buttons (Save draft / Mark finished / Recompute) are
  replaced by a SINGLE **"Save & compute"** button backed by one new server action
  `saveAndCompute(matchId, scoreA, scoreB, goals[])` in `app/admin/actions.ts`: `requireAdmin`
  → validate scores (int ≥ 0) and that every scorer belongs to one of the two squads → upsert
  `score_a/score_b` and set `finished = true` → replace `match_goals` (delete then one row per
  goal) → recompute idempotently (delete `prediction_points`, re-run `scorePrediction` over
  every LOCKED prediction, unlocked skipped) → revalidate. Re-opening a finished match still
  loads the saved score + goals for editing; re-saving overwrites and re-recomputes cleanly —
  that's how corrections work (no separate recompute). Removed the now-unused `saveResult`,
  `finishMatch`, and `recomputePoints` actions (the shared `recomputeMatch` helper stays);
  `setUnderdog` is unchanged. The soft "goals ≠ score" warning remains a non-blocking hint.
  `npm run build` clean and all 16 scoring tests pass.
- **Fix: predictions SELECT RLS recursion** — moved the own-lock reveal check into
  SECURITY DEFINER `has_locked_prediction()`; policy no longer self-references predictions.
- **Phase 3 §2 (predictions page):** Built the user-facing predictions flow — **no schema,
  scoring-engine, or admin-panel changes**. Added `lib/auth.ts → requireUser()` (loads the
  current user server-side, `redirect("/login")` if not signed in). `app/predictions/page.tsx`
  (server, `force-dynamic`) replaces the placeholder: pins a compact collapsible "How scoring
  works" banner (`<details>`, styled `.rules-banner` in globals.css), then renders **one flat
  list of all 72 matches ordered by `kickoff_at` ascending** (no group/date headings) with team
  **flag emojis** from `teams.flag_url` (a `<span>`, never `<img>`). It loads the user's own
  predictions (+ `prediction_scorers`), every player once (id→squad map for dropdowns + name
  lookups), and — only for **revealed** matches — all predictions + predictor profiles in two
  batched queries (RLS gates these). Per-match state is computed server-side from `now()`,
  `finished`, `predictions_close_at`, and the user's own `locked`: **finished / closed / locked /
  open**; finished cards dimmed, the soonest open one badged "Next up". `app/predictions/MatchCard.tsx`
  ("use client") is the card: header (flag + names, group · MD · IST kickoff/close), prominent
  ⚡ underdog tag, two score inputs (score_a↔team_a, score_b↔team_b — alignment preserved on
  save), and capped scorer picks (cap = scoreA+scoreB, both squads in `<optgroup>`s ordered by
  shirt #, "Add scorer" blocked at cap, lowering a score trims extras with a soft note, picks
  optional). **Open** state shows "Save draft" + "Lock in Prediction"; Lock opens an inline
  two-step confirm ("You can't edit this after locking. Lock it in?") that saves+locks atomically;
  a warning notes unlocked predictions don't count. **Locked / Closed / Finished** are read-only:
  the user's scoreline + backed scorers by name, the reveal list ("Name (username)" + scoreline +
  scorers, own row highlighted), final score on finished, and "you didn't lock in time — you're
  out (0 points)" on a closed match the user never locked. While Open, a "🔒 Everyone's picks
  unlock once you lock yours" hint stands in for the (RLS-hidden) reveal. `app/predictions/actions.ts`
  ("use server"): `savePrediction` (draft, locked=false) and `lockPrediction` (atomic save+lock)
  share a `writePrediction` helper that `requireUser()`s, re-checks the match is open and the
  existing row isn't locked, validates scores (int ≥ 0) + dedupes/caps scorers + verifies each ∈
  the two squads, upserts `predictions` (unique user_id+match_id), replaces `prediction_scorers`
  **while still unlocked** (the scorers RLS write policy requires an unlocked parent), then flips
  `locked`/`locked_at` last; `revalidatePath("/predictions")`. No delete action. Added a
  "Predictions" header link for logged-in users in `SiteHeader`. `npm run build` clean and all 16
  scoring tests pass. (Leaderboards are §3.)
- **Predictions page — drop the draft button:** Removed the "Save draft" path from the user
  prediction card. The Open state now shows a single **"Lock in Prediction"** button which opens
  the inline "You can't edit this after locking. Lock it in?" are-you-sure confirm before
  submitting (save + lock atomically). Deleted the now-unused `savePrediction` server action in
  `app/predictions/actions.ts` (only `lockPrediction` remains; the shared `writePrediction` helper
  is unchanged). No schema/scoring/admin changes; `tsc --noEmit` clean.
- **Phase 3 §3 (leaderboards — complete; Phase 3 done):** Read-only display built on existing
  data — **no schema, scoring-engine, admin-panel, or prediction write/lock/reveal changes**.
  (A) **Total leaderboard** — `app/leaderboard/page.tsx` replaces the placeholder: server
  component, `requireUser()`, reads the `public.leaderboard` VIEW, sorts `total_pts` DESC then
  `username` ASC (stable ties), and renders a ranked table — Rank · Name (username) · Exact ·
  Winner · GD · Scorers · Underdog · **Total**. The category columns are the view's *counts*
  (`exact_count`/`winners_count`/`gd_count`/`scorers_count`/`underdog_count`) — a caption notes
  they're tallies that deliberately don't sum to the points total; Total = `total_pts`
  (gold/display/tabular). Current user's row highlighted, negatives render fine, and because the
  view LEFT JOINs profiles the **full roster shows at 0** before any match finishes. Table is in
  a `.lb-scroll` horizontal-scroll wrapper for phones. (B) **Per-finished-match leaderboard** —
  new `app/predictions/MatchLeaderboard.tsx` (`"use client"` for click-to-expand), rendered in
  `MatchCard`'s **finished** branch below the final score. Shows a compact POINTS table (Win ·
  GD · Exact · Scor · Udog → **Match total**, sorted by total DESC then username) — these are
  `winner_pts/gd_pts/exact_pts/scorer_pts/underdog_pts` and **DO** sum to the total (contrast the
  counts board). Current user highlighted; each row expands to that player's predicted scoreline
  (🏳 TeamA x–y TeamB 🏳) + backed scorers with flags (or "No scorers picked"). Zero rows →
  "No locked predictions for this match." **Closed-but-not-finished** matches keep the §2 plain
  reveal list plus a small "Results pending" note (Open/Locked unchanged). (C) **Standings panel**
  on `/predictions` — `app/predictions/StandingsPanel.tsx` (server) reusing the leaderboard view:
  top 8 (Rank · Name · Total) plus the current user's own rank if they're below the cut, with a
  "Full leaderboard →" link. Rendered twice — a sticky desktop right column (`variant="aside"`)
  and a collapsible mobile section at the top (`variant="mobile"`, closed by default) — toggled
  by `.standings-aside`/`.standings-mobile` + a `.preds-layout` CSS grid (matches list left,
  aside right at ≥1024px). The predictions page now batches one `prediction_points` query over all
  finished match ids (joined to the already-loaded predictor profiles + the existing reveal data
  for the expand detail) and one `leaderboard` query. (D) Added a **"Leaderboard"** header link
  for logged-in users in `SiteHeader`; tabular numerals on all point/score figures. `npm run
  build` clean and all 16 scoring tests pass. **Phase 3 is complete.**
- **Phase 3 §3 (final revision — supersedes the standings-panel build above):** Reworked the
  §3 display so the **only** full board lives at `/leaderboard`; `/predictions` is back to a
  single column. **No schema, scoring-engine, admin-panel, or prediction write/lock/reveal
  changes.** (A) **Navigation** — added a "← Home" link near the top of both
  `app/predictions/page.tsx` and `app/leaderboard/page.tsx`; the `SiteHeader` wordmark links to
  `/` with Predictions + Leaderboard links for logged-in users, and the logged-in home keeps the
  "Make Predictions" / "Leaderboard" buttons. (B) **Overall leaderboard** — `/leaderboard`
  unchanged in substance: counts table (Exact/Winner/GD/Scorers/Underdog) + gold **Total**,
  ranked `total_pts` DESC then `username`, current row highlighted, full roster at 0 before
  results, caption noting the columns are tallies. (C) **Finished-match card** — under the
  "Full time" line, `MatchCard`'s finished branch now shows a **scorers line with minutes**
  (`ScorersSummary`): goals grouped by the team they counted FOR (own goal → opposing team,
  marked "(OG)"), ordered by the leading integer of the minute text (blanks last), "No scorers
  recorded." when empty. Below it, the per-match POINTS board moved into a **collapsed-by-default
  "View match leaderboard ▸/▾"** toggle (`MatchLeaderboard.tsx`, `"use client"`); expanded it's
  the Win/GD/Exact/Scor/Udog → Match total table (sorts to total, current row highlighted), and
  each row is **click-to-expand** to that player's predicted scoreline + backed scorers (flags),
  "No scorers picked." / "Prediction unavailable." / "No locked predictions for this match." as
  the empty states. **Closed-but-not-finished** still shows the plain reveal list + a "Results
  pending" note; Open/Locked unchanged. (D) **Removed** `app/predictions/StandingsPanel.tsx` and
  its `.standings-aside`/`.standings-mobile` + `.preds-layout` grid CSS (now a plain 880px single
  column). The predictions page batches the same one `prediction_points` + one `match_goals`
  query over all finished match ids and joins to the reveal data for the expand detail; no
  separate `leaderboard` query on `/predictions` anymore. `npm run build` clean and all 16 scoring
  tests pass. **Phase 3 is complete.**
