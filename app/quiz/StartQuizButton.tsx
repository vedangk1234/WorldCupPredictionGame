"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAttempt } from "./actions";

// The one-time "Start Quiz" button. Starting inserts the attempt server-side
// (the unique(quiz_id,user_id) constraint prevents a second attempt) and then
// refreshes so the server component renders the live runner.
export default function StartQuizButton({ quizId }: { quizId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onStart() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await startAttempt(quizId);
    if (!res.ok) {
      setBusy(false);
      setError(res.message ?? "Could not start the quiz.");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={onStart}
        disabled={busy}
        style={{
          marginTop: 20,
          padding: "13px 26px",
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
        {busy ? "Starting…" : "Start Quiz"}
      </button>
      {error && <p style={{ color: "var(--m3)", marginTop: 12, fontSize: 14 }}>{error}</p>}
    </>
  );
}
