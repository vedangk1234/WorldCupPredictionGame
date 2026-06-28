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
//   - 'ro32'  → FT scoring as in group, PLUS an extra-time (ET) portion that
//     only applies when the user PREDICTED an FT draw, PLUS a penalty portion
//     when the user predicted a level ET and the match actually went to pens.
//     Superstar applies on EVERY ro32 match (not just round-3).
//
// Only the FT components (winner/gd/exact/scorer/underdog) become leaderboard
// columns/tallies. ET points, penalty points, and the superstar delta fold into
// `totalPts` ONLY — they never affect the tally counts. Negatives are unclamped.

export interface ActualGoal {
  playerId: number;
  isOwnGoal: boolean;
}

export interface ScoringInput {
  stage: "group" | "ro32";
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

  // --- ro32 only (ignored entirely when stage === 'group') -----------------
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
  const isRo32 = input.stage === "ro32";

  // ---- FT portion (ALWAYS — identical to the group-stage rules) -----------
  const predMargin = input.predScoreA - input.predScoreB;
  const actMargin = input.actualScoreA - input.actualScoreB;

  // Winner: +3 only in a decisive FT match where the predicted winning side
  // matches. A draw never awards the winner point.
  const winnerPts =
    actMargin !== 0 && sign(predMargin) === sign(actMargin) ? 3 : 0;

  // Goal difference / margin: +1 when the exact FT margin matches. For a draw
  // this is 0 === 0, so a correctly-predicted draw earns it.
  const gdPts = predMargin === actMargin ? 1 : 0;

  // Exact FT score: +5 for the precise scoreline.
  const exactPts =
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

  // The ET portion applies ONLY when the user predicted an FT draw — that is the
  // signal that they expected the match to go beyond 90 minutes.
  const predictedFtDraw = input.predScoreA === input.predScoreB;
  if (isRo32 && predictedFtDraw) {
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
  }

  // ---- Superstar (group-stage round-3 OR any ro32 match) ------------------
  // For each DISTINCT picked superstar (across FT + ET picks): +3 if they scored
  // at least one REAL (non-own) goal ANYWHERE in the match (FT or ET), else −3.
  // Folds into the total only; does NOT touch correctScorers or any tally.
  let superstarPts = 0;
  const applySuperstar = isRo32 ? true : input.isRound3;
  if (applySuperstar) {
    const superstarSet = new Set(input.superstarPlayerIds);
    const allPicks = new Set([...input.predictedScorerIds, ...etPicks]);
    const allGoals = isRo32 ? [...input.actualGoals, ...etGoals] : input.actualGoals;
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
