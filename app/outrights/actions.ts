"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  getOutright,
  validateOutrightAnswers,
  FINALIST_TEAM_IDS,
  type OutrightAnswers,
} from "@/lib/outrights";

export interface ActionResult {
  ok: boolean;
  message: string;
}

// Shared write behind saveOutrights (draft) and lockOutrights. Re-checks the
// logged-in user server-side, re-loads the outrights row (the deadline is the
// authority — the client clock is never trusted), rejects if past locks_at or if
// the user's row is already locked, RE-VALIDATES every answer (including the
// champion/runner-up opposite-semis rule and the golden-ball pool loaded from the
// DB), then upserts. `lock` flips locked=true + locked_at last.
async function writeOutrights(
  answers: OutrightAnswers,
  lock: boolean,
): Promise<ActionResult> {
  const { user, supabase } = await requireUser();

  const outright = await getOutright(supabase);
  if (!outright) return { ok: false, message: "Outrights are not open yet." };

  // Deadline is server-authoritative.
  if (new Date(outright.locks_at).getTime() <= Date.now()) {
    return { ok: false, message: "Outrights predictions are closed." };
  }

  // Reject if an existing row is already locked (RLS also blocks the update).
  const { data: existing } = await supabase
    .from("outright_predictions")
    .select("id, locked")
    .eq("outrights_id", outright.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing?.locked) {
    return { ok: false, message: "Your outrights are already locked." };
  }

  // Load the golden-ball pool (all players from the four finalists) so the
  // server can verify the golden-ball pick — never trust the client's list.
  const { data: poolRows, error: poolErr } = await supabase
    .from("players")
    .select("id")
    .in("team_id", FINALIST_TEAM_IDS);
  if (poolErr) return { ok: false, message: poolErr.message };
  const goldenBallPool = new Set((poolRows ?? []).map((p) => p.id as number));

  const check = validateOutrightAnswers(answers, goldenBallPool);
  if (!check.ok) return { ok: false, message: check.error };

  const nowIso = new Date().toISOString();
  const row = {
    user_id: user.id,
    outrights_id: outright.id,
    champion_team_id: answers.championTeamId,
    runner_up_team_id: answers.runnerUpTeamId,
    third_place_team_id: answers.thirdPlaceTeamId,
    golden_boot_player_id: answers.goldenBootPlayerId,
    golden_ball_player_id: answers.goldenBallPlayerId,
    golden_glove_player_id: answers.goldenGlovePlayerId,
    golden_boot_goals: answers.goldenBootGoals,
    // Keep unlocked on the upsert; flip afterwards if requested.
    locked: false,
    updated_at: nowIso,
  };

  const { data: saved, error: upErr } = await supabase
    .from("outright_predictions")
    .upsert(row, { onConflict: "outrights_id,user_id" })
    .select("id")
    .single();
  if (upErr || !saved) {
    return { ok: false, message: upErr?.message ?? "Could not save your outrights." };
  }

  if (lock) {
    const { error: lockErr } = await supabase
      .from("outright_predictions")
      .update({ locked: true, locked_at: nowIso })
      .eq("id", saved.id as number);
    if (lockErr) return { ok: false, message: lockErr.message };
  }

  revalidatePath("/outrights");
  return {
    ok: true,
    message: lock
      ? "Outrights locked in — good luck!"
      : "Draft saved. Remember to lock before the first semi-final.",
  };
}

// Save a draft (editable until locked or the deadline passes).
export async function saveOutrights(answers: OutrightAnswers): Promise<ActionResult> {
  return writeOutrights(answers, false);
}

// Save AND lock — permanent, no further edits.
export async function lockOutrights(answers: OutrightAnswers): Promise<ActionResult> {
  return writeOutrights(answers, true);
}
