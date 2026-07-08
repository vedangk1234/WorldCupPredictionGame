"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  QUESTIONS_PER_QUIZ,
  QUESTION_SECONDS,
  canStartAttempt,
  resolveAnswer,
  advanceAttempt,
  type QuestionPayload,
  type Quiz,
  type QuizAttempt,
  type QuizQuestion,
} from "@/lib/quiz";

// All game logic (timing, scoring, sequencing) is server-authoritative. The
// client only ever: (a) asks to start, (b) asks for the current question, and
// (c) submits an answer and gets back "next question" or "finished". None of
// these trust the client clock, and every action re-verifies the logged-in
// user AND attempt ownership.

export interface QuizActionResult {
  ok: boolean;
  message?: string;
  finished?: boolean;
  // The current/next question to render (absent when finished or on error).
  question?: QuestionPayload;
}

// --- internal helpers ------------------------------------------------------

type Client = Awaited<ReturnType<typeof requireUser>>["supabase"];

// Load an attempt and verify it belongs to `userId`. Returns null if missing or
// not owned (never reveal someone else's attempt).
async function loadOwnedAttempt(
  supabase: Client,
  userId: string,
  attemptId: number,
): Promise<QuizAttempt | null> {
  const { data } = await supabase
    .from("quiz_attempts")
    .select("id, quiz_id, user_id, current_question_index, total_pts, completed_at, started_at")
    .eq("id", attemptId)
    .maybeSingle();
  if (!data || data.user_id !== userId) return null;
  return data as QuizAttempt;
}

// The moment the CURRENT question (at attempt.current_question_index) was shown,
// derived server-side: started_at for the first question, else the latest
// answered_at among the attempt's existing answers (submitting a question
// immediately reveals the next one). No shown_at column needed; can't be reset
// by refreshing.
async function currentQuestionShownAtMs(
  supabase: Client,
  attempt: QuizAttempt,
): Promise<number> {
  if (attempt.current_question_index <= 0) {
    return new Date(attempt.started_at).getTime();
  }
  const { data } = await supabase
    .from("quiz_answers")
    .select("answered_at")
    .eq("attempt_id", attempt.id)
    .order("answered_at", { ascending: false })
    .limit(1);
  const latest = data && data.length > 0 ? (data[0].answered_at as string) : null;
  return latest ? new Date(latest).getTime() : new Date(attempt.started_at).getTime();
}

// Load the quiz's questions ordered by order_index. Returns the full rows
// (incl. correct_option) for server-side use only.
async function loadQuestions(supabase: Client, quizId: number): Promise<QuizQuestion[]> {
  const { data } = await supabase
    .from("quiz_questions")
    .select("id, quiz_id, question_text, option_a, option_b, option_c, option_d, correct_option, order_index")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });
  return (data ?? []) as QuizQuestion[];
}

// Build the safe client payload for the attempt's current question, or signal
// completion. NEVER includes correct_option.
async function buildCurrentPayload(
  supabase: Client,
  attempt: QuizAttempt,
  questions?: QuizQuestion[],
): Promise<QuizActionResult> {
  if (attempt.completed_at) return { ok: true, finished: true };
  const qs = questions ?? (await loadQuestions(supabase, attempt.quiz_id));
  const total = qs.length || QUESTIONS_PER_QUIZ;
  const idx = attempt.current_question_index;
  if (idx >= qs.length) return { ok: true, finished: true };

  const q = qs[idx];
  const shownAt = await currentQuestionShownAtMs(supabase, attempt);
  const question: QuestionPayload = {
    questionId: q.id,
    index: idx,
    total,
    questionText: q.question_text,
    options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
    deadlineTs: shownAt + QUESTION_SECONDS * 1000,
    serverNow: Date.now(),
  };
  return { ok: true, finished: false, question };
}

// --- actions ---------------------------------------------------------------

// Start a fresh attempt for the active quiz. Guards: quiz must be live, still
// startable (enough time left to finish), and the user must not already have an
// attempt (the unique(quiz_id,user_id) constraint is the real race guard).
export async function startAttempt(quizId: number): Promise<QuizActionResult> {
  const { user, supabase } = await requireUser();

  const { data: quizData } = await supabase
    .from("quiz")
    .select("id, title, starts_at, ends_at, created_at")
    .eq("id", quizId)
    .maybeSingle();
  if (!quizData) return { ok: false, message: "That quiz no longer exists." };
  const quiz = quizData as Quiz;

  if (!canStartAttempt(quiz, Date.now())) {
    return { ok: false, message: "This quiz isn't open to start right now." };
  }

  // Already have an attempt? Never allow a second one.
  const { data: existing } = await supabase
    .from("quiz_attempts")
    .select("id")
    .eq("quiz_id", quizId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    return { ok: false, message: "You've already started this quiz." };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("quiz_attempts")
    .insert({
      quiz_id: quizId,
      user_id: user.id,
      current_question_index: 0,
      total_pts: 0,
      started_at: new Date().toISOString(),
    })
    .select("id, quiz_id, user_id, current_question_index, total_pts, completed_at, started_at")
    .single();
  if (insErr || !inserted) {
    // 23505 = unique violation → an attempt already exists (race).
    if (insErr?.code === "23505") {
      return { ok: false, message: "You've already started this quiz." };
    }
    return { ok: false, message: insErr?.message ?? "Could not start the quiz." };
  }

  revalidatePath("/quiz");
  return buildCurrentPayload(supabase, inserted as QuizAttempt);
}

// Load the current question for an in-progress attempt (used for the initial
// render and to recover after a refresh/reload). Ownership-checked; returns the
// question WITHOUT correct_option, or a finished flag.
export async function getCurrentQuestion(attemptId: number): Promise<QuizActionResult> {
  const { user, supabase } = await requireUser();
  const attempt = await loadOwnedAttempt(supabase, user.id, attemptId);
  if (!attempt) return { ok: false, message: "Attempt not found." };
  return buildCurrentPayload(supabase, attempt);
}

// Submit (or auto-timeout) the current question. Server-authoritative:
//   - verifies ownership + attempt not completed,
//   - rejects a submission for anything other than the current question (this is
//     what blocks skipping ahead OR re-answering a past question; the
//     unique(attempt_id, question_id) index is the backstop),
//   - forces a timeout if the 15s window (+ grace) has elapsed since the
//     question was shown, regardless of what the client sent,
//   - scores +3 / -1 / 0, records the answer, advances the index, adds the
//     points to total_pts, and completes the attempt at question 10.
export async function submitAnswer(
  attemptId: number,
  questionId: number,
  selectedOption: "A" | "B" | "C" | "D" | null,
): Promise<QuizActionResult> {
  const { user, supabase } = await requireUser();

  const attempt = await loadOwnedAttempt(supabase, user.id, attemptId);
  if (!attempt) return { ok: false, message: "Attempt not found." };
  if (attempt.completed_at) return { ok: true, finished: true };

  const questions = await loadQuestions(supabase, attempt.quiz_id);
  const total = questions.length || QUESTIONS_PER_QUIZ;
  const idx = attempt.current_question_index;
  if (idx >= questions.length) return { ok: true, finished: true };

  const current = questions[idx];
  // Must be answering exactly the current question — no skipping ahead / back.
  if (current.id !== questionId) {
    return { ok: false, message: "That isn't the current question." };
  }

  // Enforce the 15s window server-side (never trust the client clock): a late
  // submit is forced to a timeout (null) no matter what was sent.
  const shownAt = await currentQuestionShownAtMs(supabase, attempt);
  const { selected, isCorrect, pointsAwarded } = resolveAnswer({
    shownAtMs: shownAt,
    nowMs: Date.now(),
    selected: selectedOption,
    correct: current.correct_option,
  });

  // Record the answer FIRST — the unique(attempt_id, question_id) index makes a
  // double-submit fail here, before we ever touch total_pts / the index.
  // Set answered_at explicitly (don't rely on a DB default) — the next
  // question's 15s window is derived from the latest answered_at, so it must be
  // populated.
  const { error: ansErr } = await supabase.from("quiz_answers").insert({
    attempt_id: attempt.id,
    question_id: current.id,
    selected_option: selected,
    is_correct: isCorrect,
    points_awarded: pointsAwarded,
    answered_at: new Date().toISOString(),
  });
  if (ansErr) {
    if (ansErr.code === "23505") {
      // Already answered (double submit / auto-timeout race). Re-sync by
      // returning the current state rather than double-counting.
      const fresh = await loadOwnedAttempt(supabase, user.id, attemptId);
      return buildCurrentPayload(supabase, (fresh ?? attempt) as QuizAttempt);
    }
    return { ok: false, message: ansErr.message };
  }

  // Advance the attempt: bump the index, add points, complete at the last one.
  const { nextIndex, completed, newTotal } = advanceAttempt(
    idx,
    pointsAwarded,
    attempt.total_pts,
    total,
  );
  const { error: updErr } = await supabase
    .from("quiz_attempts")
    .update({
      current_question_index: nextIndex,
      total_pts: newTotal,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", attempt.id);
  if (updErr) return { ok: false, message: updErr.message };

  revalidatePath("/quiz");

  if (completed) return { ok: true, finished: true };
  // Return the next question so the client can transition forward in one trip.
  const nextAttempt: QuizAttempt = {
    ...attempt,
    current_question_index: nextIndex,
    total_pts: newTotal,
  };
  return buildCurrentPayload(supabase, nextAttempt, questions);
}
