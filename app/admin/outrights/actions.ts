"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  getOutright,
  scoreOutright,
  GOLDEN_BOOT_PLAYER_IDS,
  GOLDEN_GLOVE_PLAYER_IDS,
  FINALIST_TEAM_IDS,
  GOLDEN_BOOT_GOALS_MIN,
  GOLDEN_BOOT_GOALS_MAX,
  type OutrightPrediction,
} from "@/lib/outrights";

export interface ActionResult {
  ok: boolean;
  message: string;
}

// The seven actual results the admin enters. Each may be null while not yet
// known; `finalised` flips the results live for the scoring/correct-wrong view.
export interface OutrightResultInput {
  championTeamId: number | null;
  runnerUpTeamId: number | null;
  thirdPlaceTeamId: number | null;
  goldenBootPlayerId: number | null;
  goldenBallPlayerId: number | null;
  goldenGlovePlayerId: number | null;
  goldenBootGoals: number | null;
  finalised: boolean;
}

function revalidateOutrights() {
  revalidatePath("/admin/outrights");
  revalidatePath("/outrights");
}

// Light validation of the entered results: teams (if set) must be finalists,
// award players (if set) on their shortlists, golden ball (if set) a player of
// the four finalists, goals (if set) in [8,15]. Nulls are allowed (unknown yet).
async function validateResults(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  r: OutrightResultInput,
): Promise<string | null> {
  for (const id of [r.championTeamId, r.runnerUpTeamId, r.thirdPlaceTeamId]) {
    if (id != null && !FINALIST_TEAM_IDS.includes(id)) {
      return "Result teams must be one of the four semi-finalists.";
    }
  }
  if (r.goldenBootPlayerId != null && !GOLDEN_BOOT_PLAYER_IDS.includes(r.goldenBootPlayerId)) {
    return "Golden Boot result is not on the shortlist.";
  }
  if (r.goldenGlovePlayerId != null && !GOLDEN_GLOVE_PLAYER_IDS.includes(r.goldenGlovePlayerId)) {
    return "Golden Glove result is not on the shortlist.";
  }
  if (
    r.goldenBootGoals != null &&
    (!Number.isInteger(r.goldenBootGoals) ||
      r.goldenBootGoals < GOLDEN_BOOT_GOALS_MIN ||
      r.goldenBootGoals > GOLDEN_BOOT_GOALS_MAX)
  ) {
    return `Golden Boot goals must be between ${GOLDEN_BOOT_GOALS_MIN} and ${GOLDEN_BOOT_GOALS_MAX}.`;
  }
  if (r.goldenBallPlayerId != null) {
    const { data } = await supabase
      .from("players")
      .select("id")
      .eq("id", r.goldenBallPlayerId)
      .in("team_id", FINALIST_TEAM_IDS)
      .maybeSingle();
    if (!data) return "Golden Ball result must be a player from the four remaining teams.";
  }
  return null;
}

// Save the actual outright results (upsert on outrights_id). Admin only.
export async function saveOutrightResults(input: OutrightResultInput): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const outright = await getOutright(supabase);
  if (!outright) return { ok: false, message: "No outrights competition exists." };

  const err = await validateResults(supabase, input);
  if (err) return { ok: false, message: err };

  const { error } = await supabase.from("outright_results").upsert(
    {
      outrights_id: outright.id,
      champion_team_id: input.championTeamId,
      runner_up_team_id: input.runnerUpTeamId,
      third_place_team_id: input.thirdPlaceTeamId,
      golden_boot_player_id: input.goldenBootPlayerId,
      golden_ball_player_id: input.goldenBallPlayerId,
      golden_glove_player_id: input.goldenGlovePlayerId,
      golden_boot_goals: input.goldenBootGoals,
      finalised: input.finalised,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "outrights_id" },
  );
  if (error) return { ok: false, message: error.message };

  revalidateOutrights();
  return { ok: true, message: "Results saved." };
}

// Score every LOCKED outright prediction into outright_points (exact-match only,
// no partial credit). Idempotent (upsert on user_id). Admin only.
//
// NOTE: this writes to outright_points, which needs an admin-write RLS policy.
// If it is missing you'll get a row-level-security error here — add the policy
// (see the handoff notes) and re-run Compute.
export async function computeOutrightPoints(): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const outright = await getOutright(supabase);
  if (!outright) return { ok: false, message: "No outrights competition exists." };

  const { data: resultData, error: resErr } = await supabase
    .from("outright_results")
    .select(
      "outrights_id, champion_team_id, runner_up_team_id, third_place_team_id, golden_boot_player_id, golden_boot_goals, golden_ball_player_id, golden_glove_player_id, finalised, updated_at",
    )
    .eq("outrights_id", outright.id)
    .maybeSingle();
  if (resErr) return { ok: false, message: resErr.message };
  if (!resultData) return { ok: false, message: "Enter and save the results first." };

  // Load all LOCKED predictions (page in 1000-row chunks — PostgREST caps at 1000).
  const preds: OutrightPrediction[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: chunk, error } = await supabase
      .from("outright_predictions")
      .select(
        "id, user_id, outrights_id, champion_team_id, runner_up_team_id, third_place_team_id, golden_boot_player_id, golden_ball_player_id, golden_glove_player_id, golden_boot_goals, locked, locked_at",
      )
      .eq("outrights_id", outright.id)
      .eq("locked", true)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { ok: false, message: error.message };
    const rows = (chunk ?? []) as OutrightPrediction[];
    preds.push(...rows);
    if (rows.length < PAGE) break;
  }

  // Recompute idempotently: clear the (single-competition) points table, then
  // re-insert fresh rows. outright_points has no unique key to upsert on, so this
  // delete-then-insert mirrors the match recompute layer.
  const { error: delErr } = await supabase
    .from("outright_points")
    .delete()
    .not("user_id", "is", null);
  if (delErr) return { ok: false, message: `Clear failed: ${delErr.message}` };

  if (preds.length === 0) {
    revalidateOutrights();
    return { ok: true, message: "No locked predictions to score." };
  }

  const rows = preds.map((p) => scoreOutright(p, resultData));
  const { error: insErr } = await supabase.from("outright_points").insert(rows);
  if (insErr) return { ok: false, message: `Write failed: ${insErr.message}` };

  revalidateOutrights();
  return { ok: true, message: `Scored ${rows.length} locked prediction(s) into outright_points.` };
}
