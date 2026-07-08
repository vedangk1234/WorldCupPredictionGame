"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QUIZ_OPTIONS, QUESTION_SECONDS, type QuestionPayload, type QuizOption } from "@/lib/quiz";
import { submitAnswer } from "./actions";

// The live one-question-at-a-time runner. Renders the question text at the TOP
// with the four options laid out BELOW as selectable cards, a per-question 15s
// countdown, and a separate Submit button. Selecting an option only highlights
// it locally; Submit (or the timer hitting 0) locks it in server-side and
// transitions FORWARD to the next question. There is no back button and no way
// to revisit a prior question — each question is a fresh page.
export default function QuizRunner({
  attemptId,
  initialQuestion,
}: {
  attemptId: number;
  initialQuestion: QuestionPayload;
}) {
  const router = useRouter();
  const [question, setQuestion] = useState<QuestionPayload>(initialQuestion);
  const [selected, setSelected] = useState<QuizOption | null>(null);
  const [remaining, setRemaining] = useState<number>(QUESTION_SECONDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest selection, readable from the timeout callback without re-binding it.
  const selectedRef = useRef<QuizOption | null>(null);
  selectedRef.current = selected;
  // Guards against the manual Submit and the auto-timeout firing twice.
  const answeringRef = useRef(false);

  const goToQuestion = useCallback((q: QuestionPayload) => {
    setQuestion(q);
    setSelected(null);
    selectedRef.current = null;
    answeringRef.current = false;
    setBusy(false);
    setError(null);
  }, []);

  const submit = useCallback(
    async (option: QuizOption | null) => {
      if (answeringRef.current) return; // already submitting this question
      answeringRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const res = await submitAnswer(attemptId, question.questionId, option);
        if (!res.ok) {
          // Re-enable so the user (or timer) can retry; surface the reason.
          answeringRef.current = false;
          setBusy(false);
          setError(res.message ?? "Something went wrong. Try again.");
          return;
        }
        if (res.finished || !res.question) {
          // Completed — let the server component render the results screen.
          router.refresh();
          return;
        }
        goToQuestion(res.question);
      } catch {
        answeringRef.current = false;
        setBusy(false);
        setError("Network error. Try again.");
      }
    },
    [attemptId, question.questionId, router, goToQuestion],
  );

  // Per-question countdown. Derived from the server's deadline + its clock at
  // send time, so it uses only elapsed deltas — the client's absolute clock is
  // never trusted (the real enforcement is server-side in submitAnswer anyway).
  useEffect(() => {
    const mountedAt = Date.now();
    const compute = () => {
      const elapsed = Date.now() - mountedAt;
      const serverEstimate = question.serverNow + elapsed;
      return Math.max(0, Math.ceil((question.deadlineTs - serverEstimate) / 1000));
    };
    setRemaining(compute());
    const id = setInterval(() => {
      const left = compute();
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        // Auto-submit whatever is currently selected (or null → timeout).
        void submit(selectedRef.current);
      }
    }, 250);
    return () => clearInterval(id);
  }, [question, submit]);

  const danger = remaining <= 5;

  return (
    <div
      style={{
        border: "1px solid var(--pitch-line)",
        borderRadius: 14,
        background: "var(--pitch-800, #10231a)",
        padding: 22,
      }}
    >
      {/* Progress + countdown */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <span
          style={{
            color: "var(--gold-400)",
            letterSpacing: "0.14em",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          QUESTION {question.index + 1} / {question.total}
        </span>
        <span
          aria-live="polite"
          style={{
            fontVariantNumeric: "tabular-nums",
            fontWeight: 800,
            fontSize: 20,
            color: danger ? "var(--m3)" : "var(--chalk)",
            minWidth: 44,
            textAlign: "right",
          }}
        >
          0:{String(remaining).padStart(2, "0")}
        </span>
      </div>

      {/* Countdown bar */}
      <div
        style={{
          height: 6,
          borderRadius: 99,
          background: "var(--pitch-line)",
          overflow: "hidden",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${(remaining / QUESTION_SECONDS) * 100}%`,
            background: danger ? "var(--m3)" : "var(--gold-400)",
            transition: "width 250ms linear",
          }}
        />
      </div>

      {/* Question text at the TOP */}
      <h2
        className="display"
        style={{ fontSize: 23, lineHeight: 1.25, margin: "0 0 18px" }}
      >
        {question.questionText}
      </h2>

      {/* Four options laid out BELOW as selectable cards (A/B/C/D) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {QUIZ_OPTIONS.map((opt) => {
          const isSel = selected === opt;
          return (
            <button
              key={opt}
              type="button"
              disabled={busy}
              onClick={() => setSelected(opt)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                textAlign: "left",
                width: "100%",
                padding: "13px 15px",
                borderRadius: 11,
                cursor: busy ? "default" : "pointer",
                border: isSel ? "2px solid var(--gold-400)" : "1px solid var(--pitch-line)",
                background: isSel ? "rgba(255, 208, 92, 0.12)" : "transparent",
                color: "var(--chalk)",
                fontSize: 15.5,
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  flex: "0 0 auto",
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  background: isSel ? "var(--gold-400)" : "var(--pitch-line)",
                  color: isSel ? "#1a1206" : "var(--chalk-dim)",
                }}
              >
                {opt}
              </span>
              <span>{question.options[opt]}</span>
            </button>
          );
        })}
      </div>

      {error && <p style={{ color: "var(--m3)", marginTop: 14, fontSize: 14 }}>{error}</p>}

      {/* Separate Submit button — selecting an option does NOT submit. */}
      <button
        type="button"
        disabled={busy}
        onClick={() => submit(selected)}
        style={{
          marginTop: 20,
          width: "100%",
          padding: "13px 18px",
          borderRadius: 11,
          border: "none",
          cursor: busy ? "default" : "pointer",
          background: "var(--gold-400)",
          color: "#1a1206",
          fontWeight: 800,
          fontSize: 16,
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Submitting…" : selected ? "Submit answer" : "Submit (no answer)"}
      </button>

      <p style={{ color: "var(--chalk-dim)", fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
        You can change your selection until you press Submit. Once submitted you move on — no going back.
      </p>
    </div>
  );
}
