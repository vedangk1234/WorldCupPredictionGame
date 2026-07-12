// Outrights — tournament-long predictions, locked before the first semi-final.
//
// Live schema (already in Supabase — this feature adds NO SQL, alters no tables):
//   outrights            (id, title, locks_at, created_at)
//   outright_predictions (id, user_id, outrights_id,
//                         champion_team_id, runner_up_team_id, third_place_team_id,
//                         golden_boot_player_id, golden_ball_player_id,
//                         golden_glove_player_id, golden_boot_goals,
//                         locked, locked_at, created_at, updated_at)
//                         unique(outrights_id, user_id); CHECKs: the trio must be
//                         non-null + distinct, golden_boot_goals ∈ [8,15].
//   outright_results     (outrights_id pk, champion_team_id, runner_up_team_id,
//                         third_place_team_id, golden_boot_player_id,
//                         golden_boot_goals, golden_ball_player_id,
//                         golden_glove_player_id, finalised, updated_at)
//   outright_points      (user_id, champion_pts, runner_up_pts, third_place_pts,
//                         golden_boot_pts, boot_goals_pts, golden_ball_pts,
//                         golden_glove_pts, total_pts)
//
// The leaderboard is intentionally NOT touched here — outright points are folded
// into the leaderboard view with SQL separately. This app never sums outright
// points into any leaderboard total.

import type { SupabaseClient } from "@supabase/supabase-js";

// --- Row types -------------------------------------------------------------

export interface Outright {
  id: number;
  title: string | null;
  locks_at: string;
  created_at: string;
}

export interface OutrightPrediction {
  id: number;
  user_id: string;
  outrights_id: number;
  champion_team_id: number | null;
  runner_up_team_id: number | null;
  third_place_team_id: number | null;
  golden_boot_player_id: number | null;
  golden_ball_player_id: number | null;
  golden_glove_player_id: number | null;
  golden_boot_goals: number | null;
  locked: boolean;
  locked_at: string | null;
}

export interface OutrightResult {
  outrights_id: number;
  champion_team_id: number | null;
  runner_up_team_id: number | null;
  third_place_team_id: number | null;
  golden_boot_player_id: number | null;
  golden_boot_goals: number | null;
  golden_ball_player_id: number | null;
  golden_glove_player_id: number | null;
  finalised: boolean;
  updated_at: string | null;
}

export interface OutrightPoints {
  user_id: string;
  champion_pts: number;
  runner_up_pts: number;
  third_place_pts: number;
  golden_boot_pts: number;
  boot_goals_pts: number;
  golden_ball_pts: number;
  golden_glove_pts: number;
  total_pts: number;
}

// --- The bracket (task-critical, do NOT simplify) --------------------------
// SF1 (match 101): France (33) v Spain (31)
// SF2 (match 102): England (46) v Argentina (38)
// Champion + runner-up are the two finalists, so they MUST come from OPPOSITE
// semi-finals (a team cannot beat its own semi opponent in the final).

export const SEMI_FINALS: { matchId: number; teamIds: [number, number] }[] = [
  { matchId: 101, teamIds: [33, 31] }, // France v Spain
  { matchId: 102, teamIds: [46, 38] }, // England v Argentina
];

// The four semi-finalists (the only valid champion / runner-up / third teams).
export const FINALIST_TEAM_IDS = [33, 31, 46, 38];

// team id → its semi-final opponent's team id. Used to remove a champion's own
// semi opponent from the runner-up options (they can't both reach the final).
export const SEMI_OPPONENT: Record<number, number> = {
  33: 31,
  31: 33,
  46: 38,
  38: 46,
};

// --- Fixed shortlists (hardcoded player ids per the task) ------------------
// Golden Boot: Mbappé(450,FRA), Kane(423,ENG), Bellingham(424,ENG),
//              Messi(35,ARG), Dembélé(447,FRA), Oyarzabal(1058,ESP).
export const GOLDEN_BOOT_PLAYER_IDS = [450, 423, 424, 35, 447, 1058];

// Golden Glove: Emiliano Martínez(48,ARG — NOT Lautaro 47 / Lisandro 31),
//               Pickford(415,ENG), Unai Simón(1060,ESP), Maignan(456,FRA).
export const GOLDEN_GLOVE_PLAYER_IDS = [48, 415, 1060, 456];

// Golden Ball has no shortlist — any player from the four remaining teams.

// --- Golden Boot goals dropdown (exact-match only, 8..15 inclusive) --------
export const GOLDEN_BOOT_GOALS_MIN = 8;
export const GOLDEN_BOOT_GOALS_MAX = 15;
export const GOLDEN_BOOT_GOALS_OPTIONS = Array.from(
  { length: GOLDEN_BOOT_GOALS_MAX - GOLDEN_BOOT_GOALS_MIN + 1 },
  (_, i) => GOLDEN_BOOT_GOALS_MIN + i,
);

// --- Points per question (exact match only, no partial credit) — pool 31 ---
export const OUTRIGHT_POINTS = {
  champion: 7,
  runnerUp: 3,
  thirdPlace: 3,
  goldenBoot: 5,
  goldenBall: 5,
  goldenGlove: 5,
  bootGoals: 3,
} as const;

export const OUTRIGHT_TOTAL_POOL = 31;

// --- The 7 answers a user submits (all required) ---------------------------
export interface OutrightAnswers {
  championTeamId: number | null;
  runnerUpTeamId: number | null;
  thirdPlaceTeamId: number | null;
  goldenBootPlayerId: number | null;
  goldenBallPlayerId: number | null;
  goldenGlovePlayerId: number | null;
  goldenBootGoals: number | null;
}

export type Validation = { ok: true } | { ok: false; error: string };

// Shared validation used by BOTH the client (UX) and the server (authority —
// never trust the client). `goldenBallPool` is the set of valid golden-ball
// player ids (every player from the four finalists); the server always passes
// it, the client omits it (the grouped dropdown already constrains membership).
export function validateOutrightAnswers(
  a: OutrightAnswers,
  goldenBallPool?: Set<number>,
): Validation {
  const ch = a.championTeamId;
  const ru = a.runnerUpTeamId;
  const th = a.thirdPlaceTeamId;

  // All seven questions are required (the DB also rejects a missing trio).
  if (ch == null || ru == null || th == null) {
    return { ok: false, error: "Pick a champion, runner-up and third place." };
  }
  if (
    a.goldenBootPlayerId == null ||
    a.goldenBallPlayerId == null ||
    a.goldenGlovePlayerId == null ||
    a.goldenBootGoals == null
  ) {
    return { ok: false, error: "Answer all seven questions before saving." };
  }

  // The trio must be three of the four semi-finalists.
  for (const id of [ch, ru, th]) {
    if (!FINALIST_TEAM_IDS.includes(id)) {
      return { ok: false, error: "Teams must be one of the four semi-finalists." };
    }
  }

  // All three distinct.
  if (ch === ru || ch === th || ru === th) {
    return {
      ok: false,
      error: "Champion, runner-up and third place must be three different teams.",
    };
  }

  // Champion + runner-up are the two FINALISTS → they must be from OPPOSITE
  // semi-finals (they cannot have played each other in the semi).
  if (SEMI_OPPONENT[ch] === ru) {
    return {
      ok: false,
      error: "Champion and runner-up must come from opposite semi-finals.",
    };
  }

  // Golden Boot / Golden Glove must be on their fixed shortlists.
  if (!GOLDEN_BOOT_PLAYER_IDS.includes(a.goldenBootPlayerId)) {
    return { ok: false, error: "Golden Boot pick is not on the shortlist." };
  }
  if (!GOLDEN_GLOVE_PLAYER_IDS.includes(a.goldenGlovePlayerId)) {
    return { ok: false, error: "Golden Glove pick is not on the shortlist." };
  }

  // Golden Ball must be a player from the four remaining teams.
  if (goldenBallPool && !goldenBallPool.has(a.goldenBallPlayerId)) {
    return {
      ok: false,
      error: "Golden Ball pick must be a player from the four remaining teams.",
    };
  }

  // Golden Boot goals: whole number in [8, 15].
  if (
    !Number.isInteger(a.goldenBootGoals) ||
    a.goldenBootGoals < GOLDEN_BOOT_GOALS_MIN ||
    a.goldenBootGoals > GOLDEN_BOOT_GOALS_MAX
  ) {
    return {
      ok: false,
      error: `Golden Boot goals must be a whole number from ${GOLDEN_BOOT_GOALS_MIN} to ${GOLDEN_BOOT_GOALS_MAX}.`,
    };
  }

  return { ok: true };
}

// Per-question scoring — EXACT match only, no partial credit. A null result
// value (question not yet set) scores 0 for everyone.
export function scoreOutright(
  pred: OutrightPrediction,
  result: OutrightResult,
): OutrightPoints {
  const eq = (a: number | null, b: number | null) => a != null && b != null && a === b;
  const champion_pts = eq(pred.champion_team_id, result.champion_team_id)
    ? OUTRIGHT_POINTS.champion
    : 0;
  const runner_up_pts = eq(pred.runner_up_team_id, result.runner_up_team_id)
    ? OUTRIGHT_POINTS.runnerUp
    : 0;
  const third_place_pts = eq(pred.third_place_team_id, result.third_place_team_id)
    ? OUTRIGHT_POINTS.thirdPlace
    : 0;
  const golden_boot_pts = eq(pred.golden_boot_player_id, result.golden_boot_player_id)
    ? OUTRIGHT_POINTS.goldenBoot
    : 0;
  const golden_ball_pts = eq(pred.golden_ball_player_id, result.golden_ball_player_id)
    ? OUTRIGHT_POINTS.goldenBall
    : 0;
  const golden_glove_pts = eq(pred.golden_glove_player_id, result.golden_glove_player_id)
    ? OUTRIGHT_POINTS.goldenGlove
    : 0;
  const boot_goals_pts = eq(pred.golden_boot_goals, result.golden_boot_goals)
    ? OUTRIGHT_POINTS.bootGoals
    : 0;
  return {
    user_id: pred.user_id,
    champion_pts,
    runner_up_pts,
    third_place_pts,
    golden_boot_pts,
    boot_goals_pts,
    golden_ball_pts,
    golden_glove_pts,
    total_pts:
      champion_pts +
      runner_up_pts +
      third_place_pts +
      golden_boot_pts +
      golden_ball_pts +
      golden_glove_pts +
      boot_goals_pts,
  };
}

// The single outrights competition row (soonest id), or null if none exists.
// Used to gate the nav link and every outrights page.
export async function getOutright(supabase: SupabaseClient): Promise<Outright | null> {
  const { data, error } = await supabase
    .from("outrights")
    .select("id, title, locks_at, created_at")
    .order("id", { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0] as Outright;
}

// Flag emoji prefix — the SAME rendering used on MatchCard (reads the emoji
// stored in teams.flag_url; never an <img>). Empty when no flag is set.
export function flagPrefix(flag_url: string | null | undefined): string {
  return flag_url ? `${flag_url} ` : "";
}
