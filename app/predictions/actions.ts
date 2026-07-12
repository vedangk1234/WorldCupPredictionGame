"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { computeRound2MatchIds } from "@/lib/round2";
import { isKnockout } from "@/lib/scoring";
import type { Stage } from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  message: string;
}

// Knockout (ro32) prediction extras supplied at lock time. All null/empty for a
// group fixture or when the user predicted a decisive full-time score (no ET).
// See CLAUDE.md §2.10. The server NEVER trusts these — it re-derives the stage
// from the stored match and re-validates every field below.
export interface Ro32LockExtras {
  predEtA: number | null; // predicted extra-time TOTAL (includes the FT goals)
  predEtB: number | null;
  predPenWinnerTeamId: number | null; // predicted shoot-out winner (level ET only)
  scorerIdsEt: number[]; // ET scorer picks (only when ET adds goals over FT)
}

// Total "2x" doublers a user gets for the whole tournament.
const MAX_2X_TOKENS = 3;

// Shared validation + write behind lockPrediction. Re-checks the
// logged-in user server-side, enforces the open/not-locked window (RLS enforces
// it again at the row level), validates the score and scorer picks against the
// two squads and the goal cap, then upserts the prediction and replaces its
// scorers. When `lock` is true it finally sets locked=true (scorers must be
// written while the row is still unlocked — the prediction_scorers RLS write
// policy requires the parent prediction to be unlocked).
//
// `use2x` is the opt-in doubler chosen at lock time. It is validated entirely
// server-side (never trust the client): the match must be 2x-eligible (round-2
// by kickoff order AND no underdog set) and the user must have a doubler left.
// used_2x is only ever set true via a lock; the draft path keeps it false.
//
// `ro32` carries the knockout extra-time / penalty / ET-scorer prediction. It is
// honoured ONLY when the stored match stage is 'ro32' AND the user predicted an
// FT draw; otherwise the ET/pen fields are forced null and ET scorers dropped.
// All of it is re-validated server-side (ET total >= FT per team, pen winner
// required + valid on a level ET, ET scorers only up to the goals added in ET).
async function writePrediction(
  matchId: number,
  scoreA: number,
  scoreB: number,
  scorerPlayerIds: number[],
  lock: boolean,
  use2x: boolean,
  ro32: Ro32LockExtras | null,
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
    .select("team_a_id, team_b_id, predictions_close_at, finished, underdog_team_id, stage")
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

  // 2x can only ever be set at lock time. A draft always keeps used_2x false.
  const want2x = lock && use2x;
  if (want2x) {
    // Eligibility: the match must be round-2 (by kickoff order) AND have no
    // underdog. Compute the round-2 set server-side over all matches.
    if (match.underdog_team_id !== null) {
      return {
        ok: false,
        message: "You cannot set 2x for matches where there is an underdog.",
      };
    }
    const { data: allMatches } = await supabase
      .from("matches")
      .select("id, team_a_id, team_b_id, kickoff_at");
    const round2 = computeRound2MatchIds(
      (allMatches ?? []).map((m) => ({
        id: m.id as number,
        team_a_id: m.team_a_id as number,
        team_b_id: m.team_b_id as number,
        kickoff_at: m.kickoff_at as string,
      })),
    );
    if (!round2.has(matchId)) {
      return { ok: false, message: "2x can only be used on a second-round match." };
    }

    // Doubler budget: count the user's OTHER locked predictions already using
    // 2x. Must be under the cap (excluding this match — re-saving is blocked
    // above once locked, so excluding it is just defensive).
    const { count, error: cntErr } = await supabase
      .from("predictions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("locked", true)
      .eq("used_2x", true)
      .neq("match_id", matchId);
    if (cntErr) return { ok: false, message: cntErr.message };
    if ((count ?? 0) >= MAX_2X_TOKENS) {
      return {
        ok: false,
        message: `No 2x left — you've already used all ${MAX_2X_TOKENS} doublers.`,
      };
    }
  }

  // ----- Resolve + validate the knockout ET / penalty / ET-scorer fields -----
  // The stored stage is the authority. ET only applies on a knockout match
  // (ro32/ro16) whose PREDICTED full-time score is a draw (the signal the user
  // expects extra time).
  const knockout = isKnockout(match.stage as Stage);
  const predFtDraw = scoreA === scoreB;
  const wantEt = knockout && predFtDraw;

  let predEtA: number | null = null;
  let predEtB: number | null = null;
  let predPenWinnerTeamId: number | null = null;
  let etScorerIds: number[] = [];

  if (wantEt) {
    const etA = ro32?.predEtA ?? null;
    const etB = ro32?.predEtB ?? null;
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
        message: "Enter the extra-time total score as whole numbers (0 or more).",
      };
    }
    if (etA < scoreA || etB < scoreB) {
      return {
        ok: false,
        message: "Extra-time total can't be lower than full-time.",
      };
    }
    predEtA = etA;
    predEtB = etB;

    // ET scorers are allowed only up to the number of goals ADDED in extra time
    // (ET total − FT total). No added goals ⇒ no ET scorer picks.
    const addedGoals = etA + etB - (scoreA + scoreB);
    etScorerIds = Array.from(new Set(ro32?.scorerIdsEt ?? []));
    if (etScorerIds.length > addedGoals) {
      return {
        ok: false,
        message:
          addedGoals === 0
            ? "No goals added in extra time — you can't name any extra-time scorers."
            : `You can name at most ${addedGoals} extra-time scorer(s).`,
      };
    }

    // A level ET goes to penalties → a shoot-out winner is required.
    if (etA === etB) {
      const pen = ro32?.predPenWinnerTeamId ?? null;
      if (pen !== match.team_a_id && pen !== match.team_b_id) {
        return {
          ok: false,
          message: "Extra time is level — pick the penalty shoot-out winner.",
        };
      }
      predPenWinnerTeamId = pen;
    } else {
      // Decisive in ET → no shoot-out.
      predPenWinnerTeamId = null;
    }
  }

  // Dedupe FT scorer picks and validate the cap.
  const uniqueScorerIds = Array.from(new Set(scorerPlayerIds));
  if (uniqueScorerIds.length > scoreA + scoreB) {
    return {
      ok: false,
      message: `You can name at most ${scoreA + scoreB} scorer(s) for a ${scoreA}–${scoreB} prediction.`,
    };
  }

  // Validate every picked scorer (FT + ET) belongs to one of the two squads.
  const allPickIds = Array.from(new Set([...uniqueScorerIds, ...etScorerIds]));
  if (allPickIds.length > 0) {
    const { data: squad } = await supabase
      .from("players")
      .select("id")
      .in("team_id", [match.team_a_id, match.team_b_id]);
    const validIds = new Set((squad ?? []).map((p) => p.id as number));
    for (const id of allPickIds) {
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
        // Never set 2x on the unlocked write — it's applied atomically at lock.
        used_2x: false,
        // Knockout ET / penalty prediction (null for group or a decisive FT).
        pred_et_a: predEtA,
        pred_et_b: predEtB,
        pred_pen_winner_team_id: predPenWinnerTeamId,
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

  // Replace scorers wholesale — FT picks (is_et=false) + ET picks (is_et=true).
  const { error: delErr } = await supabase
    .from("prediction_scorers")
    .delete()
    .eq("prediction_id", predictionId);
  if (delErr) return { ok: false, message: delErr.message };

  const scorerRows = [
    ...uniqueScorerIds.map((pid) => ({
      prediction_id: predictionId,
      player_id: pid,
      is_et: false,
    })),
    ...etScorerIds.map((pid) => ({
      prediction_id: predictionId,
      player_id: pid,
      is_et: true,
    })),
  ];
  if (scorerRows.length > 0) {
    const { error: insErr } = await supabase.from("prediction_scorers").insert(scorerRows);
    if (insErr) return { ok: false, message: insErr.message };
  }

  // Finally lock if asked — after scorers are written. The 2x doubler is set
  // here, atomically with the lock, and is permanent thereafter.
  if (lock) {
    const { error: lockErr } = await supabase
      .from("predictions")
      .update({ locked: true, locked_at: new Date().toISOString(), used_2x: want2x })
      .eq("id", predictionId);
    if (lockErr) return { ok: false, message: lockErr.message };
  }

  // Group fixtures live at /group-stage; ro32 cards at /ro32; ro16 at /ro16; the
  // Quarter-finals at /qf; the Semi-finals on the home page.
  revalidatePath("/group-stage");
  revalidatePath("/ro32");
  revalidatePath("/ro16");
  revalidatePath("/qf");
  revalidatePath("/");
  return {
    ok: true,
    message: lock
      ? want2x
        ? "Locked in with 2x ON ⚡ — good luck!"
        : "Locked in. Good luck!"
      : "Draft saved — remember to lock before kickoff.",
  };
}

// Save AND lock in one atomic action — permanent, no further edits. `use2x`
// applies the doubler at lock time (validated server-side). `ro32` carries the
// knockout ET / penalty / ET-scorer prediction (null for group fixtures and
// decisive-FT predictions; re-validated server-side).
export async function lockPrediction(
  matchId: number,
  scoreA: number,
  scoreB: number,
  scorerPlayerIds: number[],
  use2x: boolean,
  ro32: Ro32LockExtras | null = null,
): Promise<ActionResult> {
  return writePrediction(matchId, scoreA, scoreB, scorerPlayerIds, true, use2x, ro32);
}
