"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { scorePrediction } from "@/lib/scoring";
import type { GoalEntry } from "@/lib/types";

type ServerClient = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

export interface ActionResult {
  ok: boolean;
  message: string;
}

function revalidateAdmin(matchId: number) {
  revalidatePath("/admin");
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
// and scorers, upserts the score, marks the match finished, replaces this
// match's goals (one row per goal — a brace = two rows, each carrying its
// minute (display only) and is_own_goal flag), then recomputes points over
// every LOCKED prediction. Idempotent: re-opening a finished match, correcting
// the result, and re-saving overwrites and re-recomputes cleanly — this is how
// corrections work (no separate draft / finish / recompute steps).
// ---------------------------------------------------------------------------
export async function saveAndCompute(
  matchId: number,
  scoreA: number,
  scoreB: number,
  goals: GoalEntry[],
): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
    return { ok: false, message: "Scores must be whole numbers of 0 or more." };
  }

  const { data: match, error: loadErr } = await supabase
    .from("matches")
    .select("team_a_id, team_b_id")
    .eq("id", matchId)
    .single();
  if (loadErr || !match) return { ok: false, message: "Match not found." };

  // Validate every picked player belongs to one of the two squads.
  const { data: players } = await supabase
    .from("players")
    .select("id")
    .in("team_id", [match.team_a_id, match.team_b_id]);
  const validIds = new Set((players ?? []).map((p) => p.id as number));

  for (const g of goals) {
    if (!validIds.has(g.player_id)) {
      return { ok: false, message: "A selected scorer is not in either squad." };
    }
  }

  // Score + finished in one update.
  const { error: scoreErr } = await supabase
    .from("matches")
    .update({ score_a: scoreA, score_b: scoreB, finished: true })
    .eq("id", matchId);
  if (scoreErr) return { ok: false, message: scoreErr.message };

  // Replace this match's goals wholesale — one row per goal.
  const { error: delErr } = await supabase
    .from("match_goals")
    .delete()
    .eq("match_id", matchId);
  if (delErr) return { ok: false, message: delErr.message };

  if (goals.length > 0) {
    const rows = goals.map((g) => ({
      match_id: matchId,
      player_id: g.player_id,
      minute: g.minute.trim() === "" ? null : g.minute.trim(),
      is_own_goal: g.is_own_goal,
    }));
    const { error: insErr } = await supabase.from("match_goals").insert(rows);
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
// Not exported as an action (helper only).
// ---------------------------------------------------------------------------
async function recomputeMatch(supabase: ServerClient, matchId: number): Promise<void> {
  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select("team_a_id, team_b_id, underdog_team_id, score_a, score_b")
    .eq("id", matchId)
    .single();
  if (matchErr || !match) throw new Error("Match not found.");
  if (match.score_a === null || match.score_b === null) {
    throw new Error("Save a result (score) before computing points.");
  }

  // Each match_goals row is one goal — map directly for the engine.
  const { data: goals } = await supabase
    .from("match_goals")
    .select("player_id, is_own_goal")
    .eq("match_id", matchId);
  const actualGoals: { playerId: number; isOwnGoal: boolean }[] = (goals ?? []).map((g) => ({
    playerId: g.player_id as number,
    isOwnGoal: g.is_own_goal as boolean,
  }));

  // Only LOCKED predictions count. (After a match is played its close time has
  // passed, so the reveal-by-close RLS clause lets the admin read them all.)
  const { data: preds, error: predErr } = await supabase
    .from("predictions")
    .select("id, user_id, score_a, score_b, prediction_scorers(player_id)")
    .eq("match_id", matchId)
    .eq("locked", true);
  if (predErr) throw new Error(predErr.message);

  // Clean slate, then re-insert — keeps recompute idempotent.
  const { error: delErr } = await supabase
    .from("prediction_points")
    .delete()
    .eq("match_id", matchId);
  if (delErr) throw new Error(delErr.message);

  const now = new Date().toISOString();
  const rows = (preds ?? []).map((p) => {
    const scorerIds = ((p.prediction_scorers ?? []) as { player_id: number }[]).map(
      (s) => s.player_id,
    );
    const res = scorePrediction({
      predScoreA: p.score_a as number,
      predScoreB: p.score_b as number,
      predictedScorerIds: scorerIds,
      actualScoreA: match.score_a as number,
      actualScoreB: match.score_b as number,
      actualGoals,
      teamAId: match.team_a_id as number,
      teamBId: match.team_b_id as number,
      underdogTeamId: (match.underdog_team_id as number | null) ?? null,
    });
    return {
      prediction_id: p.id as number,
      user_id: p.user_id as string,
      match_id: matchId,
      winner_pts: res.winnerPts,
      gd_pts: res.gdPts,
      exact_pts: res.exactPts,
      scorer_pts: res.scorerPts,
      underdog_pts: res.underdogPts,
      total_pts: res.totalPts,
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
