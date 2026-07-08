"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { scorePrediction, isKnockout, ActualGoal } from "@/lib/scoring";
import { computeRound3MatchIds } from "@/lib/round3";
import type { GoalEntry, Stage } from "@/lib/types";

type ServerClient = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

export interface ActionResult {
  ok: boolean;
  message: string;
}

// Extra-time / penalty result for a knockout match (CLAUDE.md §knockout-scoring).
// For a group fixture, stage = 'group' and the rest are null/empty (ignored).
export interface SaveExtras {
  stage: Stage;
  etScoreA: number | null; // ACTUAL extra-time totals (include the FT goals)
  etScoreB: number | null;
  penWinnerTeamId: number | null; // ACTUAL shoot-out winner (only when ET ended level)
  etGoals: GoalEntry[]; // goals scored DURING extra time (one row per goal)
}

function revalidateAdmin(matchId: number) {
  revalidatePath("/admin");
  revalidatePath("/admin/ro16");
  revalidatePath("/admin/ro32");
  revalidatePath("/admin/group-stage");
  revalidatePath(`/admin/match/${matchId}`);
}

// ---------------------------------------------------------------------------
// Underdog control — set Team A, Team B, or clear (null). Editable any time.
// ---------------------------------------------------------------------------
export async function setUnderdog(
  matchId: number,
  teamId: number | null,
): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const { data: match, error: loadErr } = await supabase
    .from("matches")
    .select("team_a_id, team_b_id, finished")
    .eq("id", matchId)
    .single();
  if (loadErr || !match) return { ok: false, message: "Match not found." };

  if (teamId !== null && teamId !== match.team_a_id && teamId !== match.team_b_id) {
    return { ok: false, message: "Underdog must be one of the two teams." };
  }

  const { error } = await supabase
    .from("matches")
    .update({ underdog_team_id: teamId })
    .eq("id", matchId);
  if (error) return { ok: false, message: error.message };

  revalidateAdmin(matchId);
  return {
    ok: true,
    message: match.finished
      ? "Underdog saved. This match is finished — hit Save & compute to apply it."
      : "Underdog saved.",
  };
}

// ---------------------------------------------------------------------------
// Save the result AND compute points in one atomic step. Validates the score
// and scorers, upserts the score (plus any knockout ET total + penalty winner),
// marks the match finished, replaces this match's goals (one row per goal, FT
// goals is_et=false and ET goals is_et=true), then recomputes points over every
// LOCKED prediction. Idempotent: re-opening a finished match, correcting the
// result, and re-saving overwrites and re-recomputes cleanly — this is how
// corrections work (no separate draft / finish / recompute steps).
//
// Knockout (ro32) rules enforced here:
//   - ET inputs only apply when the FT score is a DRAW. A decisive FT clears
//     et/pen back to null.
//   - The ET total must be >= the FT total for each team.
//   - A LEVEL ET requires a recorded penalty winner (one of the two teams);
//     a decisive ET clears the penalty winner.
// ---------------------------------------------------------------------------
export async function saveAndCompute(
  matchId: number,
  scoreA: number,
  scoreB: number,
  goals: GoalEntry[],
  extras: SaveExtras,
): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
    return { ok: false, message: "Scores must be whole numbers of 0 or more." };
  }

  const { data: match, error: loadErr } = await supabase
    .from("matches")
    .select("team_a_id, team_b_id, stage")
    .eq("id", matchId)
    .single();
  if (loadErr || !match) return { ok: false, message: "Match not found." };

  // Trust the stored stage as the authority (not the client's claim). Both
  // knockout stages (ro32/ro16) get the ET/penalty treatment.
  const knockout = isKnockout(match.stage as Stage);
  const ftDraw = scoreA === scoreB;
  const storeEt = knockout && ftDraw;

  // Resolve the ET / penalty values to persist.
  let etScoreA: number | null = null;
  let etScoreB: number | null = null;
  let penWinnerTeamId: number | null = null;
  const etGoals: GoalEntry[] = storeEt ? extras.etGoals : [];

  if (storeEt) {
    const etA = extras.etScoreA;
    const etB = extras.etScoreB;
    if (
      etA === null ||
      etB === null ||
      !Number.isInteger(etA) ||
      !Number.isInteger(etB) ||
      etA < 0 ||
      etB < 0
    ) {
      return {
        ok: false,
        message: "Enter the extra-time totals as whole numbers (0 or more).",
      };
    }
    if (etA < scoreA || etB < scoreB) {
      return {
        ok: false,
        message: "Extra-time totals can't be lower than the full-time score.",
      };
    }
    etScoreA = etA;
    etScoreB = etB;

    if (etA === etB) {
      // Level after ET → a penalty winner is required.
      if (
        penWinnerTeamId === null &&
        extras.penWinnerTeamId !== match.team_a_id &&
        extras.penWinnerTeamId !== match.team_b_id
      ) {
        return {
          ok: false,
          message: "Extra time was level — pick the penalty shoot-out winner.",
        };
      }
      penWinnerTeamId = extras.penWinnerTeamId;
    } else {
      // Decisive in ET → no shoot-out.
      penWinnerTeamId = null;
    }
  }

  // Validate every picked scorer (FT + ET) belongs to one of the two squads.
  const { data: players } = await supabase
    .from("players")
    .select("id")
    .in("team_id", [match.team_a_id, match.team_b_id]);
  const validIds = new Set((players ?? []).map((p) => p.id as number));
  for (const g of [...goals, ...etGoals]) {
    if (!validIds.has(g.player_id)) {
      return { ok: false, message: "A selected scorer is not in either squad." };
    }
  }

  // Score (FT) + ET totals + penalty winner + finished in one update.
  const { error: scoreErr } = await supabase
    .from("matches")
    .update({
      score_a: scoreA,
      score_b: scoreB,
      finished: true,
      et_score_a: etScoreA,
      et_score_b: etScoreB,
      pen_winner_team_id: penWinnerTeamId,
    })
    .eq("id", matchId);
  if (scoreErr) return { ok: false, message: scoreErr.message };

  // Replace this match's goals wholesale — one row per goal, flagged FT vs ET.
  const { error: delErr } = await supabase
    .from("match_goals")
    .delete()
    .eq("match_id", matchId);
  if (delErr) return { ok: false, message: delErr.message };

  const goalRows = [
    ...goals.map((g) => ({ ...g, is_et: false })),
    ...etGoals.map((g) => ({ ...g, is_et: true })),
  ].map((g) => ({
    match_id: matchId,
    player_id: g.player_id,
    minute: g.minute.trim() === "" ? null : g.minute.trim(),
    is_own_goal: g.is_own_goal,
    is_et: g.is_et,
  }));
  if (goalRows.length > 0) {
    const { error: insErr } = await supabase.from("match_goals").insert(goalRows);
    if (insErr) return { ok: false, message: insErr.message };
  }

  // Recompute points idempotently over every locked prediction.
  try {
    await recomputeMatch(supabase, matchId);
  } catch (e) {
    revalidateAdmin(matchId);
    return {
      ok: false,
      message: `Result saved, but points failed to compute: ${(e as Error).message}`,
    };
  }

  revalidateAdmin(matchId);
  return { ok: true, message: "Result saved, match finished, and points computed." };
}

// ---------------------------------------------------------------------------
// Recompute points for one match, idempotently. Deletes the match's
// prediction_points first (so removed/unlocked predictions leave no stale rows),
// then runs the scoring engine over every LOCKED prediction and re-inserts.
// Unlocked predictions = the user is out of the match → skipped (no points row).
// Handles both group fixtures and knockouts (passes the match's stage + ET /
// penalty actuals and each prediction's ET totals, predicted shoot-out winner,
// and ET scorer picks into the extended engine). Not exported as an action.
// ---------------------------------------------------------------------------
async function recomputeMatch(supabase: ServerClient, matchId: number): Promise<void> {
  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select(
      "team_a_id, team_b_id, underdog_team_id, score_a, score_b, stage, et_score_a, et_score_b, pen_winner_team_id",
    )
    .eq("id", matchId)
    .single();
  if (matchErr || !match) throw new Error("Match not found.");
  if (match.score_a === null || match.score_b === null) {
    throw new Error("Save a result (score) before computing points.");
  }
  const stage = (match.stage as Stage) ?? "group";

  // Round-3 eligibility (3rd match by kickoff for BOTH teams) is derived from
  // ALL matches — same single source of truth used by the predictions UI. In a
  // GROUP match the +3/−3 superstar bonus applies only when round-3; in a
  // knockout (ro32/ro16) the engine applies it on every match (stage-driven).
  const { data: allMatches, error: allErr } = await supabase
    .from("matches")
    .select("id, team_a_id, team_b_id, kickoff_at");
  if (allErr) throw new Error(allErr.message);
  const round3Ids = computeRound3MatchIds(allMatches ?? []);
  const isRound3 = round3Ids.has(matchId);

  // Flagged superstar player ids. Relevant in round-3 group matches and all ro32.
  const { data: superstars, error: ssErr } = await supabase
    .from("players")
    .select("id")
    .eq("is_superstar", true);
  if (ssErr) throw new Error(ssErr.message);
  const superstarPlayerIds = (superstars ?? []).map((s) => s.id as number);

  // Each match_goals row is one goal — split FT (is_et=false) vs ET (is_et=true).
  const { data: goals } = await supabase
    .from("match_goals")
    .select("player_id, is_own_goal, is_et")
    .eq("match_id", matchId);
  const ftGoals: ActualGoal[] = [];
  const etGoals: ActualGoal[] = [];
  for (const g of goals ?? []) {
    const goal: ActualGoal = {
      playerId: g.player_id as number,
      isOwnGoal: g.is_own_goal as boolean,
    };
    if (g.is_et) etGoals.push(goal);
    else ftGoals.push(goal);
  }

  // Only LOCKED predictions count. Page in 1000-row chunks (PostgREST caps
  // responses at 1000) so EVERY locked prediction is scored. used_2x + ET fields
  // are read fresh each recompute so the result stays idempotent.
  type PredRow = {
    id: number;
    user_id: string;
    score_a: number;
    score_b: number;
    used_2x: boolean;
    pred_et_a: number | null;
    pred_et_b: number | null;
    pred_pen_winner_team_id: number | null;
    prediction_scorers: { player_id: number; is_et: boolean }[];
  };
  const preds: PredRow[] = [];
  const RECOMPUTE_PRED_PAGE = 1000;
  for (let from = 0; ; from += RECOMPUTE_PRED_PAGE) {
    const { data: chunk, error: predErr } = await supabase
      .from("predictions")
      .select(
        "id, user_id, score_a, score_b, used_2x, pred_et_a, pred_et_b, pred_pen_winner_team_id, prediction_scorers(player_id, is_et)",
      )
      .eq("match_id", matchId)
      .eq("locked", true)
      .order("id", { ascending: true })
      .range(from, from + RECOMPUTE_PRED_PAGE - 1);
    if (predErr) throw new Error(predErr.message);
    const rows = (chunk ?? []) as unknown as PredRow[];
    preds.push(...rows);
    if (rows.length < RECOMPUTE_PRED_PAGE) break;
  }

  // Clean slate, then re-insert — keeps recompute idempotent.
  const { error: delErr } = await supabase
    .from("prediction_points")
    .delete()
    .eq("match_id", matchId);
  if (delErr) throw new Error(delErr.message);

  const now = new Date().toISOString();
  const rows = preds.map((p) => {
    const scorers = (p.prediction_scorers ?? []) as {
      player_id: number;
      is_et: boolean;
    }[];
    const ftPicks = scorers.filter((s) => !s.is_et).map((s) => s.player_id);
    const etPicks = scorers.filter((s) => s.is_et).map((s) => s.player_id);
    const res = scorePrediction({
      stage,
      predScoreA: p.score_a as number,
      predScoreB: p.score_b as number,
      predictedScorerIds: ftPicks,
      actualScoreA: match.score_a as number,
      actualScoreB: match.score_b as number,
      actualGoals: ftGoals,
      teamAId: match.team_a_id as number,
      teamBId: match.team_b_id as number,
      underdogTeamId: (match.underdog_team_id as number | null) ?? null,
      isRound3,
      superstarPlayerIds,
      etScoreA: (match.et_score_a as number | null) ?? undefined,
      etScoreB: (match.et_score_b as number | null) ?? undefined,
      penWinnerTeamId: (match.pen_winner_team_id as number | null) ?? null,
      predEtA: (p.pred_et_a as number | null) ?? undefined,
      predEtB: (p.pred_et_b as number | null) ?? undefined,
      predPenWinnerTeamId: (p.pred_pen_winner_team_id as number | null) ?? null,
      predictedScorerIdsEt: etPicks,
      actualGoalsEt: etGoals,
    });
    // 2x doubling is applied HERE, in the recompute layer — never inside the
    // pure scoring engine. Only the points TOTAL doubles (negatives too). The
    // component columns and tally booleans/counts stay RAW so the tallies remain
    // honest. (ET/pen/superstar deltas live in total_pts only — see the engine.)
    const used2x = (p.used_2x as boolean) ?? false;
    const totalPts = used2x ? res.totalPts * 2 : res.totalPts;
    return {
      prediction_id: p.id as number,
      user_id: p.user_id as string,
      match_id: matchId,
      winner_pts: res.winnerPts,
      gd_pts: res.gdPts,
      exact_pts: res.exactPts,
      scorer_pts: res.scorerPts,
      underdog_pts: res.underdogPts,
      total_pts: totalPts,
      got_winner: res.gotWinner,
      got_gd: res.gotGd,
      got_exact: res.gotExact,
      correct_scorers: res.correctScorers,
      got_underdog: res.gotUnderdog,
      computed_at: now,
    };
  });

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("prediction_points").insert(rows);
    if (insErr) throw new Error(insErr.message);
  }
}
