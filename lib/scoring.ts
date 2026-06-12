// Pure scoring engine for the World Cup 2026 prediction game.
//
// This module is intentionally free of any I/O, DB, or app imports. It takes a
// single prediction plus the actual match result and returns the full points
// breakdown defined in CLAUDE.md section 2. The admin "mark finished" action
// loads every prediction for a match, runs this function once per prediction,
// and upserts the result into `prediction_points`. Re-running is idempotent.
//
// There is NO home/away meaning anywhere: `A` and `B` are just two team slots,
// and the prediction is always aligned to the same slots as the actual result.

export interface ScoringInput {
  predScoreA: number; // prediction, aligned to the match's team_a / team_b slots
  predScoreB: number;
  predictedScorerIds: number[]; // player ids the user backed (may be empty)
  actualScoreA: number; // final result, same slot alignment
  actualScoreB: number;
  actualGoals: { playerId: number; isOwnGoal: boolean }[]; // ONE entry per goal
  teamAId: number;
  teamBId: number;
  underdogTeamId: number | null; // designated underdog, or null
}

export interface ScoringResult {
  winnerPts: number;
  gdPts: number;
  exactPts: number;
  scorerPts: number;
  underdogPts: number;
  totalPts: number;
  gotWinner: boolean;
  gotGd: boolean;
  gotExact: boolean;
  correctScorers: number;
  gotUnderdog: boolean;
}

const sign = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0);

export function scorePrediction(input: ScoringInput): ScoringResult {
  const predMargin = input.predScoreA - input.predScoreB;
  const actMargin = input.actualScoreA - input.actualScoreB;

  // Winner: +3 only in a decisive match where the predicted winning side matches.
  // Draws never award the winner point.
  const winnerPts =
    actMargin !== 0 && sign(predMargin) === sign(actMargin) ? 3 : 0;

  // Goal difference / margin: +1 when the exact margin matches. For a draw this
  // is 0 === 0, so a correctly-predicted draw earns it.
  const gdPts = predMargin === actMargin ? 1 : 0;

  // Exact score: +5 for the precise scoreline.
  const exactPts =
    input.predScoreA === input.actualScoreA &&
    input.predScoreB === input.actualScoreB
      ? 5
      : 0;

  // Scorers: dedupe picks, then for each picked player net +2 per real goal
  // against -1 per own goal. scorerPts may be negative; do NOT clamp.
  const pickedIds = [...new Set(input.predictedScorerIds)];
  let scorerPts = 0;
  let correctScorers = 0;
  for (const playerId of pickedIds) {
    let normalGoals = 0;
    let ownGoals = 0;
    for (const goal of input.actualGoals) {
      if (goal.playerId !== playerId) continue;
      if (goal.isOwnGoal) ownGoals++;
      else normalGoals++;
    }
    scorerPts += normalGoals * 2 - ownGoals * 1;
    if (normalGoals >= 1) correctScorers++;
  }

  // Underdog: +5 only if a designated underdog actually won AND the user
  // predicted that underdog to win.
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

  const totalPts = winnerPts + gdPts + exactPts + scorerPts + underdogPts;

  return {
    winnerPts,
    gdPts,
    exactPts,
    scorerPts,
    underdogPts,
    totalPts,
    gotWinner: winnerPts > 0,
    gotGd: gdPts > 0,
    gotExact: exactPts > 0,
    correctScorers,
    gotUnderdog: underdogPts > 0,
  };
}
