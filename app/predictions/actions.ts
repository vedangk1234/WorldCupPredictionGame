"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";

export interface ActionResult {
  ok: boolean;
  message: string;
}

// Shared validation + write behind lockPrediction. Re-checks the
// logged-in user server-side, enforces the open/not-locked window (RLS enforces
// it again at the row level), validates the score and scorer picks against the
// two squads and the goal cap, then upserts the prediction and replaces its
// scorers. When `lock` is true it finally sets locked=true (scorers must be
// written while the row is still unlocked — the prediction_scorers RLS write
// policy requires the parent prediction to be unlocked).
async function writePrediction(
  matchId: number,
  scoreA: number,
  scoreB: number,
  scorerPlayerIds: number[],
  lock: boolean,
): Promise<ActionResult> {
  const { user, supabase } = await requireUser();

  if (
    !Number.isInteger(scoreA) ||
    !Number.isInteger(scoreB) ||
    scoreA < 0 ||
    scoreB < 0
  ) {
    return { ok: false, message: "Scores must be whole numbers of 0 or more." };
  }

  // Load the match and confirm predictions are still open.
  const { data: match, error: loadErr } = await supabase
    .from("matches")
    .select("team_a_id, team_b_id, predictions_close_at, finished")
    .eq("id", matchId)
    .single();
  if (loadErr || !match) return { ok: false, message: "Match not found." };
  if (match.finished || new Date(match.predictions_close_at).getTime() <= Date.now()) {
    return { ok: false, message: "Predictions for this match are closed." };
  }

  // Confirm any existing prediction isn't already locked.
  const { data: existing } = await supabase
    .from("predictions")
    .select("id, locked")
    .eq("user_id", user.id)
    .eq("match_id", matchId)
    .maybeSingle();
  if (existing?.locked) {
    return { ok: false, message: "Your prediction is already locked." };
  }

  // Dedupe scorer picks and validate the cap + squad membership.
  const uniqueScorerIds = Array.from(new Set(scorerPlayerIds));
  if (uniqueScorerIds.length > scoreA + scoreB) {
    return {
      ok: false,
      message: `You can name at most ${scoreA + scoreB} scorer(s) for a ${scoreA}–${scoreB} prediction.`,
    };
  }
  if (uniqueScorerIds.length > 0) {
    const { data: squad } = await supabase
      .from("players")
      .select("id")
      .in("team_id", [match.team_a_id, match.team_b_id]);
    const validIds = new Set((squad ?? []).map((p) => p.id as number));
    for (const id of uniqueScorerIds) {
      if (!validIds.has(id)) {
        return { ok: false, message: "A picked scorer is not in either squad." };
      }
    }
  }

  // Upsert the prediction row (unique on user_id+match_id). Keep locked=false
  // here so scorers can be written; we flip locked afterwards if requested.
  const { data: saved, error: upErr } = await supabase
    .from("predictions")
    .upsert(
      {
        user_id: user.id,
        match_id: matchId,
        score_a: scoreA,
        score_b: scoreB,
        locked: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,match_id" },
    )
    .select("id")
    .single();
  if (upErr || !saved) {
    return { ok: false, message: upErr?.message ?? "Could not save prediction." };
  }
  const predictionId = saved.id as number;

  // Replace scorers wholesale.
  const { error: delErr } = await supabase
    .from("prediction_scorers")
    .delete()
    .eq("prediction_id", predictionId);
  if (delErr) return { ok: false, message: delErr.message };

  if (uniqueScorerIds.length > 0) {
    const rows = uniqueScorerIds.map((pid) => ({
      prediction_id: predictionId,
      player_id: pid,
    }));
    const { error: insErr } = await supabase.from("prediction_scorers").insert(rows);
    if (insErr) return { ok: false, message: insErr.message };
  }

  // Finally lock if asked — after scorers are written.
  if (lock) {
    const { error: lockErr } = await supabase
      .from("predictions")
      .update({ locked: true, locked_at: new Date().toISOString() })
      .eq("id", predictionId);
    if (lockErr) return { ok: false, message: lockErr.message };
  }

  revalidatePath("/predictions");
  return {
    ok: true,
    message: lock ? "Locked in. Good luck!" : "Draft saved — remember to lock before kickoff.",
  };
}

// Save AND lock in one atomic action — permanent, no further edits.
export async function lockPrediction(
  matchId: number,
  scoreA: number,
  scoreB: number,
  scorerPlayerIds: number[],
): Promise<ActionResult> {
  return writePrediction(matchId, scoreA, scoreB, scorerPlayerIds, true);
}
