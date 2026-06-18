// Database row types (kept in sync with supabase/schema.sql).

export type Position = "GK" | "DEF" | "MID" | "FWD";

export interface Profile {
  id: string;
  name: string;
  username: string;
  is_admin: boolean;
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
}

export interface MatchGoal {
  id: number;
  match_id: number;
  player_id: number;
  minute: string | null;
  is_own_goal: boolean;
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
}

export interface PredictionScorer {
  id: number;
  prediction_id: number;
  player_id: number;
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
}
