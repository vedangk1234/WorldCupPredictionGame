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
  count: number;
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
}
