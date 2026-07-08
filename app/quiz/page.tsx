import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import { requireUser } from "@/lib/auth";
import {
  getActiveQuiz,
  canStartAttempt,
  isExcludedFromLeaderboard,
  QUESTIONS_PER_QUIZ,
  QUESTION_SECONDS,
  type QuizAttempt,
  type QuizQuestion,
  type QuizAnswer,
} from "@/lib/quiz";
import { getCurrentQuestion } from "./actions";
import QuizRunner from "./QuizRunner";
import StartQuizButton from "./StartQuizButton";

export const dynamic = "force-dynamic";

// The timed World Cup trivia quiz. Server-authoritative throughout — this page
// only decides WHICH screen to show (no quiz / start / live / results); all
// game logic lives in the server actions. A completed attempt can never be
// re-attempted; an in-progress attempt resumes at its exact question after a
// refresh.
export default async function QuizPage() {
  const { user, supabase } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  const username = (profile?.username as string) ?? null;
  const excluded = isExcludedFromLeaderboard(username);

  const quiz = await getActiveQuiz(supabase);

  // Load this user's attempt for the active quiz (if any).
  let attempt: QuizAttempt | null = null;
  if (quiz) {
    const { data } = await supabase
      .from("quiz_attempts")
      .select("id, quiz_id, user_id, current_question_index, total_pts, completed_at, started_at")
      .eq("quiz_id", quiz.id)
      .eq("user_id", user.id)
      .maybeSingle();
    attempt = (data as QuizAttempt) ?? null;
  }

  const excludedNote = excluded ? (
    <div
      style={{
        border: "1px solid var(--gold-300)",
        background: "rgba(255, 208, 92, 0.08)",
        borderRadius: 11,
        padding: "12px 15px",
        margin: "0 0 20px",
        color: "var(--gold-300)",
        fontSize: 13.5,
        fontWeight: 600,
      }}
    >
      Your score is for fun — you&apos;re sitting out the leaderboard this round as a current
      top-3 leader. Play away; your points just won&apos;t count this time.
    </div>
  ) : null;

  return (
    <>
      <SiteHeader />
      <main className="preds-layout">
        <Link
          href="/"
          style={{
            display: "inline-block",
            color: "var(--chalk-dim)",
            textDecoration: "none",
            fontSize: 13.5,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          ← Home
        </Link>

        <div className="stripe-26" style={{ borderRadius: 99, marginBottom: 18, maxWidth: 120 }} />
        <p
          style={{
            color: "var(--gold-400)",
            letterSpacing: "0.18em",
            fontSize: 12,
            fontWeight: 700,
            margin: 0,
          }}
        >
          FIFA WORLD CUP 2026 · TRIVIA
        </p>
        <h1 className="display" style={{ fontSize: 34, lineHeight: 1.05, margin: "8px 0 20px" }}>
          {quiz?.title ?? "World Cup Quiz"}
        </h1>

        {excludedNote}

        {!quiz ? (
          <p style={{ color: "var(--chalk-dim)", fontSize: 15 }}>
            No quiz live right now — check back later.
          </p>
        ) : attempt && attempt.completed_at ? (
          <QuizResults supabase={supabase} attempt={attempt} excluded={excluded} />
        ) : attempt ? (
          <LiveOrResume attemptId={attempt.id} />
        ) : canStartAttempt(quiz, Date.now()) ? (
          <StartScreen quizId={quiz.id} />
        ) : (
          <p style={{ color: "var(--chalk-dim)", fontSize: 15 }}>
            There isn&apos;t enough time left in this quiz window to start a full run. Catch the
            next one!
          </p>
        )}
      </main>
    </>
  );
}

// The one-time start screen with the clear "no pausing, no going back" warning.
function StartScreen({ quizId }: { quizId: number }) {
  return (
    <div
      style={{
        border: "1px solid var(--pitch-line)",
        borderRadius: 14,
        background: "var(--pitch-800, #10231a)",
        padding: 22,
      }}
    >
      <h2 className="display" style={{ fontSize: 22, margin: "0 0 10px" }}>
        Ready to play?
      </h2>
      <p style={{ color: "var(--chalk)", fontSize: 15, lineHeight: 1.5, margin: "0 0 8px" }}>
        {QUESTIONS_PER_QUIZ} questions, {QUESTION_SECONDS} seconds each. Once you start you must
        finish in one go — <strong>no pausing, no going back</strong>.
      </p>
      <ul style={{ color: "var(--chalk-dim)", fontSize: 14, lineHeight: 1.6, margin: "0 0 4px", paddingLeft: 18 }}>
        <li>Correct answer: <strong style={{ color: "var(--m4)" }}>+3</strong></li>
        <li>Wrong answer: <strong style={{ color: "var(--m3)" }}>−1</strong></li>
        <li>No answer in time: <strong>0</strong></li>
        <li>You can&apos;t change an answer once submitted, or revisit a question.</li>
      </ul>
      <StartQuizButton quizId={quizId} />
    </div>
  );
}

// Loads the current question server-side (covers resume-after-refresh) and hands
// it to the client runner. If the attempt is already effectively finished, shows
// a nudge to reload into the results view.
async function LiveOrResume({ attemptId }: { attemptId: number }) {
  const res = await getCurrentQuestion(attemptId);
  if (!res.ok || !res.question) {
    return (
      <p style={{ color: "var(--chalk-dim)", fontSize: 15 }}>
        {res.finished ? "You've completed this quiz — reload to see your results." : res.message}
      </p>
    );
  }
  return <QuizRunner attemptId={attemptId} initialQuestion={res.question} />;
}

type ServerClient = Awaited<ReturnType<typeof requireUser>>["supabase"];

function optionText(q: QuizQuestion, letter: string): string {
  switch (letter?.toUpperCase()) {
    case "A":
      return q.option_a;
    case "B":
      return q.option_b;
    case "C":
      return q.option_c;
    case "D":
      return q.option_d;
    default:
      return "";
  }
}

// The results screen: total at the top, then a per-question breakdown (the
// option the user picked or "timed out", correct/wrong, and the points earned).
// Shown both right after finishing (via router.refresh) and on any later visit.
async function QuizResults({
  supabase,
  attempt,
  excluded,
}: {
  supabase: ServerClient;
  attempt: QuizAttempt;
  excluded: boolean;
}) {
  const { data: qData } = await supabase
    .from("quiz_questions")
    .select("id, quiz_id, question_text, option_a, option_b, option_c, option_d, correct_option, order_index")
    .eq("quiz_id", attempt.quiz_id)
    .order("order_index", { ascending: true });
  const questions = (qData ?? []) as QuizQuestion[];

  const { data: aData } = await supabase
    .from("quiz_answers")
    .select("id, attempt_id, question_id, selected_option, is_correct, points_awarded, answered_at")
    .eq("attempt_id", attempt.id);
  const answers = (aData ?? []) as QuizAnswer[];
  const answerByQuestion = new Map<number, QuizAnswer>();
  for (const a of answers) answerByQuestion.set(a.question_id, a);

  return (
    <div>
      {/* Total score, prominent */}
      <div
        style={{
          border: "1px solid var(--gold-300)",
          borderRadius: 14,
          background: "rgba(255, 208, 92, 0.08)",
          padding: "18px 20px",
          marginBottom: 22,
          textAlign: "center",
        }}
      >
        <p
          style={{
            color: "var(--gold-400)",
            letterSpacing: "0.16em",
            fontSize: 12,
            fontWeight: 700,
            margin: "0 0 6px",
          }}
        >
          YOUR QUIZ SCORE
        </p>
        <p
          className="display"
          style={{ fontSize: 46, lineHeight: 1, margin: 0, fontVariantNumeric: "tabular-nums" }}
        >
          {attempt.total_pts}
        </p>
        {excluded && (
          <p style={{ color: "var(--chalk-dim)", fontSize: 13, margin: "10px 0 0" }}>
            For fun only — not counted on the leaderboard this round.
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {questions.map((q, i) => {
          const a = answerByQuestion.get(q.id);
          const selected = a?.selected_option ?? null;
          const timedOut = !selected;
          const isCorrect = a?.is_correct ?? false;
          const pts = a?.points_awarded ?? 0;
          const ptsColor = pts > 0 ? "var(--m4)" : pts < 0 ? "var(--m3)" : "var(--chalk-dim)";
          return (
            <div
              key={q.id}
              style={{
                border: "1px solid var(--pitch-line)",
                borderRadius: 12,
                background: "var(--pitch-800, #10231a)",
                padding: "14px 16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                <span style={{ color: "var(--chalk-dim)", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>
                  Q{i + 1}
                </span>
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: 14,
                    color: ptsColor,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {pts > 0 ? `+${pts}` : pts}
                </span>
              </div>
              <p style={{ color: "var(--chalk)", fontSize: 15.5, fontWeight: 600, margin: "0 0 10px", lineHeight: 1.35 }}>
                {q.question_text}
              </p>
              <p style={{ fontSize: 14, margin: "0 0 4px", color: isCorrect ? "var(--m4)" : "var(--m3)" }}>
                {timedOut ? (
                  <span style={{ color: "var(--chalk-dim)" }}>No answer — timed out</span>
                ) : (
                  <>
                    Your answer: <strong>{selected}) {optionText(q, selected!)}</strong>{" "}
                    {isCorrect ? "✓ Correct" : "✗ Wrong"}
                  </>
                )}
              </p>
              {!isCorrect && (
                <p style={{ fontSize: 13.5, margin: 0, color: "var(--chalk-dim)" }}>
                  Correct answer:{" "}
                  <strong style={{ color: "var(--chalk)" }}>
                    {q.correct_option}) {optionText(q, q.correct_option)}
                  </strong>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
