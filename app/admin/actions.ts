"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { scorePrediction } from "@/lib/scoring";
import { computeRound3MatchIds } from "@/lib/round3";
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

  // Refresh everyone's round-3 "3 consecutive correct winners" streak bonuses —
  // finishing or correcting any match can change a streak. Idempotent.
  try {
    await recomputeStreaks(supabase);
  } catch (e) {
    revalidateAdmin(matchId);
    return {
      ok: false,
      message: `Result + points saved, but streak bonuses failed to compute: ${(e as Error).message}`,
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

  // Round-3 eligibility (3rd match by kickoff for BOTH teams) is derived from
  // ALL matches — same single source of truth used by the predictions UI. The
  // +3/−3 superstar bonus applies ONLY when this match is round-3.
  const { data: allMatches, error: allErr } = await supabase
    .from("matches")
    .select("id, team_a_id, team_b_id, kickoff_at");
  if (allErr) throw new Error(allErr.message);
  const round3Ids = computeRound3MatchIds(allMatches ?? []);
  const isRound3 = round3Ids.has(matchId);

  // Flagged superstar player ids (Messi, Vinícius Júnior, Ronaldo, Kane, Yamal,
  // Mbappé). Only relevant in round-3 matches.
  const { data: superstars, error: ssErr } = await supabase
    .from("players")
    .select("id")
    .eq("is_superstar", true);
  if (ssErr) throw new Error(ssErr.message);
  const superstarPlayerIds = (superstars ?? []).map((s) => s.id as number);

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
  // used_2x is read fresh each recompute so the doubling stays idempotent.
  const { data: preds, error: predErr } = await supabase
    .from("predictions")
    .select("id, user_id, score_a, score_b, used_2x, prediction_scorers(player_id)")
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
      isRound3,
      superstarPlayerIds,
    });
    // 2x doubling is applied HERE, in the recompute layer — never inside the
    // pure scoring engine. Only the points TOTAL doubles (negatives too: −1 →
    // −2). The component columns and tally booleans/counts stay RAW so the
    // tallies remain honest (CLAUDE.md "2x tokens").
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

// ---------------------------------------------------------------------------
// Recompute the round-3 "3 consecutive correct winner predictions" streak bonus
// for EVERY user, idempotently (see CLAUDE.md §2.9). Walks the FINISHED round-3
// matches in KICKOFF order; for each user, a match is a "hit" when they have a
// LOCKED prediction whose predicted decisive winner matches the actual decisive
// winner. A wrong winner OR any draw (predicted or actual) BREAKS the run (reset
// to 0). A match the user never locked is SKIPPED (carries across, no break).
// Every 3rd consecutive hit = 1 completion (+5) and resets the running count, so
// 6 straight = 2 completions. Only FINISHED matches count.
//
// The result lands in public.streak_bonus (user_id, completions, bonus_pts =
// completions*5); the leaderboard view exposes streak_completions and folds
// bonus_pts into total_pts. The pure scoring engine is NOT touched.
// Not exported as an action (helper only).
// ---------------------------------------------------------------------------
const sign = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0);

async function recomputeStreaks(supabase: ServerClient): Promise<void> {
  // All matches → round-3 set (3rd by kickoff for BOTH teams) + per-match result.
  const { data: allMatches, error: allErr } = await supabase
    .from("matches")
    .select("id, team_a_id, team_b_id, kickoff_at, finished, score_a, score_b");
  if (allErr) throw new Error(allErr.message);
  const matches = allMatches ?? [];
  const round3Ids = computeRound3MatchIds(matches);

  // FINISHED round-3 matches, in kickoff order (id breaks ties — matches round3.ts).
  const ordered = matches
    .filter(
      (m) =>
        round3Ids.has(m.id as number) &&
        m.finished === true &&
        m.score_a !== null &&
        m.score_b !== null,
    )
    .sort(
      (a, b) =>
        new Date(a.kickoff_at as string).getTime() -
          new Date(b.kickoff_at as string).getTime() || (a.id as number) - (b.id as number),
    );

  // actual outcome sign per match (0 = draw, ±1 = decisive winner).
  const actualSign = new Map<number, number>();
  for (const m of ordered) {
    actualSign.set(m.id as number, sign((m.score_a as number) - (m.score_b as number)));
  }

  // Locked predictions for those matches: user → match → predicted winner sign.
  const orderedIds = ordered.map((m) => m.id as number);
  const predByUser = new Map<string, Map<number, number>>();
  if (orderedIds.length > 0) {
    const { data: preds, error: predErr } = await supabase
      .from("predictions")
      .select("user_id, match_id, score_a, score_b")
      .eq("locked", true)
      .in("match_id", orderedIds);
    if (predErr) throw new Error(predErr.message);
    for (const p of preds ?? []) {
      const uid = p.user_id as string;
      const inner = predByUser.get(uid) ?? new Map<number, number>();
      inner.set(
        p.match_id as number,
        sign((p.score_a as number) - (p.score_b as number)),
      );
      predByUser.set(uid, inner);
    }
  }

  // For each user, walk the finished round-3 matches in kickoff order.
  const upsertRows: {
    user_id: string;
    completions: number;
    bonus_pts: number;
    updated_at: string;
  }[] = [];
  const now = new Date().toISOString();
  for (const [uid, byMatch] of predByUser) {
    let running = 0;
    let completions = 0;
    for (const mid of orderedIds) {
      if (!byMatch.has(mid)) continue; // never locked → skip, no break
      const predSign = byMatch.get(mid)!;
      const actSign = actualSign.get(mid)!;
      // Hit = correct OUTCOME: a correctly-predicted draw counts, as does the
      // correct winning side in a decisive match. A wrong outcome (predicted draw
      // but actual decisive, predicted winner but actual draw, or wrong winner)
      // breaks the run.
      const hit = predSign === actSign;
      if (hit) {
        running++;
        if (running === 3) {
          completions++;
          running = 0;
        }
      } else {
        running = 0; // wrong outcome breaks the run
      }
    }
    upsertRows.push({
      user_id: uid,
      completions,
      bonus_pts: completions * 5,
      updated_at: now,
    });
  }

  // Clean slate, then re-insert — keeps the bonus idempotent and removes stale
  // rows for users whose streaks dropped to 0 after a correction.
  const { error: delErr } = await supabase
    .from("streak_bonus")
    .delete()
    .neq("user_id", "00000000-0000-0000-0000-000000000000");
  if (delErr) throw new Error(delErr.message);

  const nonZero = upsertRows.filter((r) => r.completions > 0);
  if (nonZero.length > 0) {
    const { error: insErr } = await supabase.from("streak_bonus").insert(nonZero);
    if (insErr) throw new Error(insErr.message);
  }
}
