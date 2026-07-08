// Pure helpers + types for the timed World Cup trivia quiz.
//
// Live schema (already in Supabase — this feature adds NO SQL):
//   quiz          (id, title, starts_at, ends_at, created_at)
//   quiz_questions(id, quiz_id, question_text, option_a..d, correct_option, order_index)
//   quiz_attempts (id, quiz_id, user_id, current_question_index, total_pts,
//                  completed_at, started_at)
//   quiz_answers  (id, attempt_id, question_id, selected_option, is_correct,
//                  points_awarded, answered_at)
//
// NOTE ON TIMING: the schema has no per-question "shown_at" column and this
// feature must not add SQL. The 15-second window is therefore derived
// server-side from data that already exists — the moment a question was shown
// is the moment the previous one was answered (`quiz_answers.answered_at`), or
// `quiz_attempts.started_at` for the very first question. This is fully
// server-authoritative (the client clock is never trusted) AND can't be reset
// by refreshing, which is stronger than a resettable shown_at column.

import type { SupabaseClient } from "@supabase/supabase-js";

// --- Rules / constants -----------------------------------------------------

export const QUESTIONS_PER_QUIZ = 10;
export const QUESTION_SECONDS = 15;
// Extra head-room required before ends_at so nobody can start a run they can't
// mathematically finish inside the window.
export const START_BUFFER_SECONDS = 30;
// Network grace added to the 15s server-side check so a submit that left the
// browser just in time isn't unfairly voided by round-trip latency.
export const SUBMIT_GRACE_MS = 2000;

// Scoring (exact, non-negotiable): correct +3, wrong -1, timeout/no answer 0.
export const POINTS_CORRECT = 3;
export const POINTS_WRONG = -1;
export const POINTS_TIMEOUT = 0;

// Cosmetic only. These three current top-3 leaders are sat out of the
// leaderboard for this round — enforced for real by the Supabase `leaderboard`
// VIEW (which zeroes their quiz points). App-side this list ONLY changes the
// wording shown; it never gates whether they can play or see their own score.
export const QUIZ_EXCLUDED_FROM_LEADERBOARD = ["mm_2605", "ouroboros", "pranavsai99"];

export type QuizOption = "A" | "B" | "C" | "D";
export const QUIZ_OPTIONS: QuizOption[] = ["A", "B", "C", "D"];

// --- Row types -------------------------------------------------------------

export interface Quiz {
  id: number;
  title: string | null;
  starts_at: string;
  ends_at: string;
  created_at: string;
}

export interface QuizQuestion {
  id: number;
  quiz_id: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string; // 'A' | 'B' | 'C' | 'D'
  order_index: number;
}

export interface QuizAttempt {
  id: number;
  quiz_id: number;
  user_id: string;
  current_question_index: number;
  total_pts: number;
  completed_at: string | null;
  started_at: string;
}

export interface QuizAnswer {
  id: number;
  attempt_id: number;
  question_id: number;
  selected_option: string | null; // 'A' | 'B' | 'C' | 'D' | null (timeout)
  is_correct: boolean;
  points_awarded: number;
  answered_at: string;
}

// The safe payload sent to the client for the live question — NEVER includes
// correct_option or any hint of it.
export interface QuestionPayload {
  questionId: number;
  index: number; // 0-based position in the run (== current_question_index)
  total: number; // total questions in the quiz
  questionText: string;
  options: { A: string; B: string; C: string; D: string };
  // Absolute epoch-ms deadline for this question, plus the server's own clock
  // at send time so the client can count down using only elapsed deltas (no
  // dependency on the client's absolute clock).
  deadlineTs: number;
  serverNow: number;
}

// --- Pure helpers ----------------------------------------------------------

export function isOption(v: unknown): v is QuizOption {
  return v === "A" || v === "B" || v === "C" || v === "D";
}

// Normalize a stored option value for comparison (defensive: tolerate case /
// stray whitespace in correct_option).
function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toUpperCase();
}

// Score a single (already window-resolved) answer. A null selected option is a
// timeout / no-answer → 0 (NOT -1). No partial credit, no speed bonus.
export function scoreAnswer(
  selected: string | null,
  correct: string,
): { isCorrect: boolean; pointsAwarded: number } {
  if (selected === null) return { isCorrect: false, pointsAwarded: POINTS_TIMEOUT };
  const isCorrect = norm(selected) === norm(correct);
  return {
    isCorrect,
    pointsAwarded: isCorrect ? POINTS_CORRECT : POINTS_WRONG,
  };
}

// True if a submit at `nowMs` is inside the 15s window (+ grace) for a question
// shown at `shownAtMs`.
export function isWithinWindow(
  shownAtMs: number,
  nowMs: number,
  graceMs: number = SUBMIT_GRACE_MS,
): boolean {
  return nowMs <= shownAtMs + QUESTION_SECONDS * 1000 + graceMs;
}

// Server-authoritative resolution of a submission: enforce the timing window
// first (a late submit is forced to a timeout regardless of what was sent),
// then score. This is the single source of truth used by submitAnswer.
export function resolveAnswer(args: {
  shownAtMs: number;
  nowMs: number;
  selected: string | null;
  correct: string;
  graceMs?: number;
}): { selected: string | null; isCorrect: boolean; pointsAwarded: number } {
  const { shownAtMs, nowMs, correct, graceMs } = args;
  // A malformed / out-of-range option is treated as no answer.
  let selected = isOption(args.selected) ? args.selected : null;
  if (selected !== null && !isWithinWindow(shownAtMs, nowMs, graceMs)) {
    selected = null; // too late → timeout
  }
  const { isCorrect, pointsAwarded } = scoreAnswer(selected, correct);
  return { selected, isCorrect, pointsAwarded };
}

// Progression after a submitted answer (models the quiz_attempts update). Index
// only ever increments (no going back); completion is when it reaches `total`.
export function advanceAttempt(
  currentIndex: number,
  pointsAwarded: number,
  currentTotal: number,
  total: number = QUESTIONS_PER_QUIZ,
): { nextIndex: number; completed: boolean; newTotal: number } {
  const nextIndex = currentIndex + 1;
  return {
    nextIndex,
    completed: nextIndex >= total,
    newTotal: currentTotal + pointsAwarded,
  };
}

// Can a fresh attempt still be started at `nowMs`? False when less than
// (10 * 15s + 30s buffer) remains before ends_at — nobody may start a run they
// can't mathematically finish inside the window. Also false outside the window.
export function canStartAttempt(quiz: Quiz, nowMs: number): boolean {
  const starts = new Date(quiz.starts_at).getTime();
  const ends = new Date(quiz.ends_at).getTime();
  if (nowMs < starts || nowMs >= ends) return false;
  const requiredMs = (QUESTIONS_PER_QUIZ * QUESTION_SECONDS + START_BUFFER_SECONDS) * 1000;
  return ends - nowMs >= requiredMs;
}

// True if this username is sat out of the leaderboard for this quiz round
// (cosmetic wording only — see QUIZ_EXCLUDED_FROM_LEADERBOARD).
export function isExcludedFromLeaderboard(username: string | null | undefined): boolean {
  return !!username && QUIZ_EXCLUDED_FROM_LEADERBOARD.includes(username);
}

// --- DB helper -------------------------------------------------------------

// The single quiz whose window contains now() (starts_at <= now < ends_at),
// else null. If several somehow overlap, the soonest-ending active one wins.
export async function getActiveQuiz(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<Quiz | null> {
  const nowIso = now.toISOString();
  const { data, error } = await supabase
    .from("quiz")
    .select("id, title, starts_at, ends_at, created_at")
    .lte("starts_at", nowIso)
    .gt("ends_at", nowIso)
    .order("ends_at", { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0] as Quiz;
}
