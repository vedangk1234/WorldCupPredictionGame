// Pure scoring engine for the World Cup 2026 prediction game.
//
// This module is intentionally free of any I/O, DB, or app imports. It takes a
// single prediction plus the actual match result and returns the full points
// breakdown defined in CLAUDE.md section 2 (group stage) and the §knockout
// section (Round-of-32). The admin "Save & compute" action loads every
// prediction for a match, runs this function once per prediction, and upserts
// the result into `prediction_points`. Re-running is idempotent.
//
// There is NO home/away meaning anywhere: `A` and `B` are just two team slots,
// and the prediction is always aligned to the same slots as the actual result.
//
// STAGE behaviour:
//   - 'group' → behaves EXACTLY as before. All et/pen fields are IGNORED.
//   - 'ro32' / 'ro16' / 'qf' / 'sf' / 'third' / 'final' → KNOCKOUT stages, scored IDENTICALLY: FT scoring as in
//     group, PLUS an extra-time (ET) portion that only applies when the user
//     PREDICTED an FT draw, PLUS a penalty portion when the user predicted a
//     level ET and the match actually went to pens. Superstar applies on EVERY
//     knockout match (not just round-3). See `isKnockout()` below.
//
// Only the FT components (winner/gd/exact/scorer/underdog) become leaderboard
// columns/tallies. ET points, penalty points, and the superstar delta fold into
// `totalPts` ONLY — they never affect the tally counts. Negatives are unclamped.

export interface ActualGoal {
  playerId: number;
  isOwnGoal: boolean;
}

// A stage is a KNOCKOUT (ET / penalties / contingent bonuses / superstar-anywhere
// all apply) when it's 'ro32', 'ro16', 'qf', 'sf', 'third', OR 'final'. Group
// fixtures are never knockouts. Single source of truth — used by the engine and
// re-used by the admin recompute, the lock action, and the UI so every "is this a
// knockout?" check stays in sync.
export function isKnockout(stage: KnockoutOrGroup): boolean {
  return (
    stage === "ro32" ||
    stage === "ro16" ||
    stage === "qf" ||
    stage === "sf" ||
    stage === "third" ||
    stage === "final"
  );
}

type KnockoutOrGroup = "group" | "ro32" | "ro16" | "qf" | "sf" | "third" | "final";

export interface ScoringInput {
  stage: KnockoutOrGroup;
  predScoreA: number; // FT prediction, aligned to the match's team_a / team_b slots
  predScoreB: number;
  predictedScorerIds: number[]; // FT scorer picks the user backed (may be empty)
  actualScoreA: number; // FT result, same slot alignment
  actualScoreB: number;
  actualGoals: ActualGoal[]; // FT goals — ONE entry per goal (a brace = two)
  teamAId: number;
  teamBId: number;
  underdogTeamId: number | null; // designated underdog, or null
  isRound3: boolean; // group-stage round-3 (3rd by kickoff for BOTH teams) — drives superstar in group stage
  superstarPlayerIds: number[]; // ids of players flagged is_superstar

  // --- knockout only (ro32/ro16; ignored entirely when stage === 'group') --
  etScoreA?: number; // ACTUAL extra-time total (includes the FT goals)
  etScoreB?: number;
  penWinnerTeamId?: number | null; // ACTUAL penalty winner (only when ET ended level)
  predEtA?: number; // PREDICTED extra-time total
  predEtB?: number;
  predPenWinnerTeamId?: number | null; // PREDICTED penalty winner
  predictedScorerIdsEt?: number[]; // ET scorer picks (scored against ET goals)
  actualGoalsEt?: ActualGoal[]; // ET goals (is_et = true) — ONE entry per goal
}

export interface ScoringResult {
  winnerPts: number;
  gdPts: number;
  exactPts: number;
  scorerPts: number;
  underdogPts: number;
  superstarPts: number; // +3 per picked superstar who scored, −3 if not (folded into total only)
  // ro32 extras — 0 for group; folded into totalPts, NEVER stored as columns.
  etWinnerPts: number;
  etGdPts: number;
  etExactPts: number;
  etScorerPts: number;
  penPts: number;
  totalPts: number;
  gotWinner: boolean;
  gotGd: boolean;
  gotExact: boolean;
  correctScorers: number; // FT-based tally only
  gotUnderdog: boolean;
}

const sign = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0);

// The ultimate winning side ('A' | 'B') of a DECIDED knockout tie, by ANY route,
// in strict priority (see CLAUDE.md §2.10):
//   1. penalties decide first (map the pen winner's team id → side, the same
//      id→side mapping the penalty scoring relies on);
//   2. else the ET total, but ONLY if ET was actually PLAYED — both totals present
//      (not null) AND unequal;
//   3. else the FT score if it was decisive (won in 90').
// Returns null only if genuinely level with no resolution — a guard; a finished
// knockout should never hit this.
//
// NOTE: this DIFFERS from the previous `finalWinnerSide()` helper it replaces —
// that one ignored a decisive FT (it defaulted a missing ET to 0–0 and returned
// null for a match won in 90'). This helper falls through to the FT score, so a
// knockout decided in regulation now yields a winning side. `finalWinnerSide()`
// had no other dependents (the ET/penalty scoring uses its own inline etA/etB/pen
// resolution, not this helper), so it was replaced outright.
function actualWinnerSide(input: ScoringInput): "A" | "B" | null {
  // 1. Penalties.
  if (input.penWinnerTeamId != null) {
    if (input.penWinnerTeamId === input.teamAId) return "A";
    if (input.penWinnerTeamId === input.teamBId) return "B";
    return null;
  }
  // 2. Extra time — only when actually played (both totals present and unequal).
  if (
    input.etScoreA != null &&
    input.etScoreB != null &&
    input.etScoreA !== input.etScoreB
  ) {
    return input.etScoreA > input.etScoreB ? "A" : "B";
  }
  // 3. Full time, if decisive.
  if (input.actualScoreA !== input.actualScoreB) {
    return input.actualScoreA > input.actualScoreB ? "A" : "B";
  }
  return null;
}

// The side ('A' | 'B') the user NAMED as the ultimate tie winner in a knockout,
// or null if they named nobody. Resolves in the order defined in CLAUDE.md §2.10:
//   - predicted a DECISIVE FT (predScoreA !== predScoreB) → their FT winner side.
//   - predicted an FT DRAW → their ET winner side if they predicted a DECISIVE ET
//     (predEtA !== predEtB); else (a LEVEL ET) their predicted penalty winner
//     mapped to a side; null if neither an ET winner nor a pen pick was named.
// Uses the same team-id → side mapping actualWinnerSide() relies on for the pen pick.
function namedWinnerSide(input: ScoringInput): "A" | "B" | null {
  if (input.predScoreA !== input.predScoreB) {
    return input.predScoreA > input.predScoreB ? "A" : "B";
  }
  const predEtA = input.predEtA ?? 0;
  const predEtB = input.predEtB ?? 0;
  if (predEtA !== predEtB) {
    return predEtA > predEtB ? "A" : "B";
  }
  if (input.predPenWinnerTeamId != null) {
    if (input.predPenWinnerTeamId === input.teamAId) return "A";
    if (input.predPenWinnerTeamId === input.teamBId) return "B";
  }
  return null;
}

// Net scorer points for one set of picks against one set of goals: +2 per real
// goal, −1 per own goal, summed per DISTINCT picked player. `correct` counts how
// many picked players scored at least one real goal (used for the FT tally).
function scoreScorers(
  pickedIds: number[],
  goals: ActualGoal[],
): { pts: number; correct: number } {
  let pts = 0;
  let correct = 0;
  for (const playerId of new Set(pickedIds)) {
    let normalGoals = 0;
    let ownGoals = 0;
    for (const goal of goals) {
      if (goal.playerId !== playerId) continue;
      if (goal.isOwnGoal) ownGoals++;
      else normalGoals++;
    }
    pts += normalGoals * 2 - ownGoals * 1;
    if (normalGoals >= 1) correct++;
  }
  return { pts, correct };
}

export function scorePrediction(input: ScoringInput): ScoringResult {
  const knockout = isKnockout(input.stage);

  // ---- FT portion (ALWAYS — identical to the group-stage rules) -----------
  const predMargin = input.predScoreA - input.predScoreB;
  const actMargin = input.actualScoreA - input.actualScoreB;

  // Winner: +3 only in a decisive FT match where the predicted winning side
  // matches. A draw never awards the winner point.
  let winnerPts =
    actMargin !== 0 && sign(predMargin) === sign(actMargin) ? 3 : 0;

  // KNOCKOUT winner rule — "name the winner, get the +3" (see CLAUDE.md §2.10).
  // In ANY knockout, the winner +3 is awarded — exactly ONCE — when the team the
  // user NAMED as the ultimate winner is the team that actually WON THE MATCH, by
  // ANY route (90 minutes, extra time, OR penalties). The named side comes from
  // namedWinnerSide() (decisive-FT prediction → their FT winner; FT-draw prediction
  // → their ET winner if they predicted a decisive ET, else their penalty pick).
  // The actual match winner comes from actualWinnerSide() (pens first, else a played
  // ET, else a decisive FT).
  //
  // For a decisive-FT predictor whose team won in 90', the plain FT winner line
  // above already set winnerPts = 3; here namedSide === actualWinnerSide (both the FT
  // winner) so this block re-affirms 3 — it never double-awards (winnerPts is a flat
  // 3, never 6) and, as it only ever SETS 3, never lowers a correct FT winner.
  //
  // This +3 is INDEPENDENT of the FT-draw final-outcome contingency below — it is
  // NOT one of the four gated bonuses (FT exact / ET exact / ET winner / pen) and
  // is never zeroed by it. A predictor can have those exact bonuses forfeited for
  // getting the ending wrong yet still earn this +3 purely for naming the team that
  // won the match. Folds into winnerPts and sets gotWinner → counts toward
  // winners_count like any other winner point.
  if (knockout) {
    const namedSide = namedWinnerSide(input);
    if (namedSide !== null && namedSide === actualWinnerSide(input)) {
      winnerPts = 3;
    }
  }

  // Goal difference / margin: +1 when the exact FT margin matches. For a draw
  // this is 0 === 0, so a correctly-predicted draw earns it.
  const gdPts = predMargin === actMargin ? 1 : 0;

  // Exact FT score: +5 for the precise scoreline. NOTE: on the ro32 FT-draw
  // branch this is later gated by `finalOutcomeCorrect` (see below) — a wrong
  // final outcome forfeits it. `let` so that branch can zero it.
  let exactPts =
    input.predScoreA === input.actualScoreA &&
    input.predScoreB === input.actualScoreB
      ? 5
      : 0;

  // FT scorers: FT picks against FT goals.
  const ft = scoreScorers(input.predictedScorerIds, input.actualGoals);
  const scorerPts = ft.pts;
  const correctScorers = ft.correct;

  // Underdog: +5 only if a designated underdog actually won (FT) AND the user
  // predicted that underdog to win. (Unchanged — FT-based.)
  let underdogPts = 0;
  if (input.underdogTeamId !== null) {
    const underdogWonActual =
      input.underdogTeamId === input.teamAId
        ? input.actualScoreA > input.actualScoreB
        : input.underdogTeamId === input.teamBId
          ? input.actualScoreB > input.actualScoreA
          : false;
    const underdogPredicted =
      input.underdogTeamId === input.teamAId
        ? input.predScoreA > input.predScoreB
        : input.underdogTeamId === input.teamBId
          ? input.predScoreB > input.predScoreA
          : false;
    if (underdogWonActual && underdogPredicted) underdogPts = 5;
  }

  // ---- ro32 ET + penalty portions -----------------------------------------
  const etPicks = input.predictedScorerIdsEt ?? [];
  const etGoals = input.actualGoalsEt ?? [];
  let etWinnerPts = 0;
  let etGdPts = 0;
  let etExactPts = 0;
  let etScorerPts = 0;
  let penPts = 0;

  // The ET portion applies ONLY when BOTH:
  //   (a) the user PREDICTED an FT draw — the signal they expected the match to go
  //       beyond 90 minutes; AND
  //   (b) extra time was ACTUALLY PLAYED — the match was LEVEL at full-time AND the
  //       actual ET totals are populated (et_score_a/et_score_b non-null).
  // A match decided in 90 minutes (no ET played) scores ZERO across EVERY ET
  // component (ET exact / ET GD / ET winner / ET scorers) and penalties for
  // EVERYONE, regardless of what they predicted — there was no extra time to score.
  // Without gate (b), a level-ET prediction wrongly earned ET GD +1 by matching a
  // DEFAULTED 0–0 actual ET on a no-ET match. The knockout FT-winner +3 above is
  // UNAFFECTED — it lives outside this block and resolves the real match winner via
  // actualWinnerSide() (which already handles a 90' result).
  const predictedFtDraw = input.predScoreA === input.predScoreB;
  const etWasPlayed =
    input.actualScoreA === input.actualScoreB &&
    input.etScoreA != null &&
    input.etScoreB != null;
  if (knockout && predictedFtDraw && etWasPlayed) {
    const etA = input.etScoreA ?? 0;
    const etB = input.etScoreB ?? 0;
    const predEtA = input.predEtA ?? 0;
    const predEtB = input.predEtB ?? 0;
    const predEtMargin = predEtA - predEtB;
    const actEtMargin = etA - etB;

    // ET winner: +3 only if the actual ET was decisive and the predicted ET
    // winning side matches. (Wrong ET winner ⇒ also no exact ET below, since
    // exact requires equality.)
    etWinnerPts =
      actEtMargin !== 0 && sign(predEtMargin) === sign(actEtMargin) ? 3 : 0;
    // ET GD: a correctly-predicted ET margin earns its own +1, independent of
    // the FT-draw GD (a correctly-predicted LEVEL ET → 0 === 0 → +1).
    etGdPts = predEtMargin === actEtMargin ? 1 : 0;
    // Exact ET: +5 for the precise ET total.
    etExactPts = predEtA === etA && predEtB === etB ? 5 : 0;
    // ET scorers: ET picks against ET goals.
    etScorerPts = scoreScorers(etPicks, etGoals).pts;

    // Penalties: only when the user predicted a LEVEL ET AND the match actually
    // ended ET level and went to a pen winner. +5 for the correct shoot-out side.
    const predEtLevel = predEtA === predEtB;
    const actEtLevel = etA === etB;
    if (predEtLevel && actEtLevel && input.penWinnerTeamId != null) {
      penPts =
        (input.predPenWinnerTeamId ?? null) === input.penWinnerTeamId ? 5 : 0;
    }

    // FINAL-OUTCOME gate: the exact-score bonuses (FT exact, ET exact, ET
    // winner, pen) are CONTINGENT on the user getting the ultimate result right.
    //   - predicted a DECISIVE ET → correct iff actual ET decisive AND the
    //     predicted ET winning side matches.
    //   - predicted a LEVEL ET → pens → correct iff the match went to pens AND
    //     the predicted shoot-out winner matches the actual one.
    // A WRONG final outcome forfeits FT exact / ET exact / ET winner / pen, but
    // KEEPS the FT GD, ET GD, scorer (FT + ET), and superstar points as earned.
    const finalOutcomeCorrect = predEtLevel
      ? input.penWinnerTeamId != null &&
        (input.predPenWinnerTeamId ?? null) === input.penWinnerTeamId
      : actEtMargin !== 0 && sign(predEtMargin) === sign(actEtMargin);
    if (!finalOutcomeCorrect) {
      exactPts = 0;
      etExactPts = 0;
      etWinnerPts = 0;
      penPts = 0;
    }
  }

  // ---- Superstar (group-stage round-3 OR any ro32 match) ------------------
  // For each DISTINCT picked superstar (across FT + ET picks): +3 if they scored
  // at least one REAL (non-own) goal ANYWHERE in the match (FT or ET), else −3.
  // Folds into the total only; does NOT touch correctScorers or any tally.
  let superstarPts = 0;
  const applySuperstar = knockout ? true : input.isRound3;
  if (applySuperstar) {
    const superstarSet = new Set(input.superstarPlayerIds);
    const allPicks = new Set([...input.predictedScorerIds, ...etPicks]);
    const allGoals = knockout ? [...input.actualGoals, ...etGoals] : input.actualGoals;
    for (const pid of allPicks) {
      if (!superstarSet.has(pid)) continue;
      let realGoals = 0;
      for (const g of allGoals) {
        if (g.playerId === pid && !g.isOwnGoal) realGoals++;
      }
      superstarPts += realGoals >= 1 ? 3 : -3;
    }
  }

  const totalPts =
    winnerPts +
    gdPts +
    exactPts +
    scorerPts +
    underdogPts +
    superstarPts +
    etWinnerPts +
    etGdPts +
    etExactPts +
    etScorerPts +
    penPts;

  return {
    winnerPts,
    gdPts,
    exactPts,
    scorerPts,
    underdogPts,
    superstarPts,
    etWinnerPts,
    etGdPts,
    etExactPts,
    etScorerPts,
    penPts,
    totalPts,
    gotWinner: winnerPts > 0,
    gotGd: gdPts > 0,
    gotExact: exactPts > 0,
    correctScorers,
    gotUnderdog: underdogPts > 0,
  };
}
