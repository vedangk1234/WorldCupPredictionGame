// Database row types (kept in sync with supabase/schema.sql).

export type Position = "GK" | "DEF" | "MID" | "FWD";

export interface Profile {
  id: string;
  name: string;
  username: string;
  is_admin: boolean;
  // IANA zone name (e.g. "Europe/Berlin"); defaults to "Asia/Kolkata". Display
  // only — deadlines/scoring run on UTC instants and ignore this.
  timezone: string | null;
  created_at: string;
}

export interface Team {
  id: number;
  name: string;
  code: string | null;
  group_letter: string | null;
  flag_url: string | null;
}

export interface Player {
  id: number;
  team_id: number;
  name: string;
  position: Position | null;
  shirt_number: number | null;
}

// `stage` distinguishes group-stage fixtures ('group') from knockouts ('ro32',
// 'ro16', 'qf', 'sf', 'third', 'final'). The knockout stages score IDENTICALLY (see
// lib/scoring.ts isKnockout). For a knockout, et_score_a/b hold the ACTUAL extra-time
// totals (include the FT goals) and pen_winner_team_id the ACTUAL shoot-out winner —
// both null until a drawn FT goes to ET / pens. See CLAUDE.md §knockout-scoring.
export type Stage = "group" | "ro32" | "ro16" | "qf" | "sf" | "third" | "final";

export interface Match {
  id: number;
  team_a_id: number;
  team_b_id: number;
  group_letter: string | null;
  matchday: number | null;
  kickoff_at: string;
  predictions_close_at: string;
  underdog_team_id: number | null;
  score_a: number | null;
  score_b: number | null;
  finished: boolean;
  stage: Stage;
  et_score_a: number | null;
  et_score_b: number | null;
  pen_winner_team_id: number | null;
}

export interface MatchGoal {
  id: number;
  match_id: number;
  player_id: number;
  minute: string | null;
  is_own_goal: boolean;
  // true for goals scored in extra time (knockouts). Group goals are always false.
  is_et: boolean;
}

export interface Prediction {
  id: number;
  user_id: string;
  match_id: number;
  score_a: number;
  score_b: number;
  locked: boolean;
  locked_at: string | null;
  // "2x" doubler — opt-in, chosen at lock time only, permanent once locked.
  // Doubles total_pts for this match (CLAUDE.md "2x tokens").
  used_2x: boolean;
  // Knockout-only predictions: extra-time totals + predicted shoot-out winner.
  // null on group fixtures and when the user didn't predict an FT draw.
  pred_et_a: number | null;
  pred_et_b: number | null;
  pred_pen_winner_team_id: number | null;
}

export interface PredictionScorer {
  id: number;
  prediction_id: number;
  player_id: number;
  // true for an ET scorer pick (knockouts). FT picks are false.
  is_et: boolean;
}

export interface PredictionPoints {
  prediction_id: number;
  user_id: string;
  match_id: number;
  winner_pts: number;
  gd_pts: number;
  exact_pts: number;
  scorer_pts: number;
  underdog_pts: number;
  total_pts: number;
  got_winner: boolean;
  got_gd: boolean;
  got_exact: boolean;
  correct_scorers: number;
  got_underdog: boolean;
}

// One goal as entered in the admin result form (one row per goal). On save each
// entry becomes one row in match_goals { match_id, player_id, minute, is_own_goal }.
// `minute` is persisted for display only and does NOT affect scoring.
export interface GoalEntry {
  player_id: number;
  minute: string;
  is_own_goal: boolean;
}

// A moment in the photo/video scrapbook. Admin-only upload; everyone views.
// `file_path` is the object key inside the public "moments" storage bucket.
export type MediaType = "image" | "video";

export interface Moment {
  id: number;
  user_id: string;
  description: string | null;
  file_path: string;
  media_type: MediaType;
  created_at: string;
}

// A like on a moment — count only, one per user (unique(moment_id, user_id)).
export interface MomentLike {
  id: number;
  moment_id: number;
  user_id: string;
}

// A comment on a moment. Anyone logged-in adds; author or admin deletes.
export interface MomentComment {
  id: number;
  moment_id: number;
  user_id: string;
  body: string;
  created_at: string;
}

// A comment enriched with its author's display name + username, for the feed UI.
export interface MomentCommentView extends MomentComment {
  name: string;
  username: string;
  mine: boolean;
}

export interface LeaderboardRow {
  user_id: string;
  name: string;
  username: string;
  total_pts: number;
  winners_count: number;
  gd_count: number;
  exact_count: number;
  scorers_count: number;
  underdog_count: number;
  // Count of this user's locked predictions with used_2x=true (0–3).
  twox_used: number;
  // Number of round-3 "4 of 6 per set" sets won (0–4). Each set won folds +5
  // into total_pts via the streak_bonus table + leaderboard view.
  sets_won: number;
}
