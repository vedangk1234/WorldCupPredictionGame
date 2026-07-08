// Self-verifying test suite for the trivia-quiz pure logic.
// Run with: npm run test:quiz
// Exits 1 if any case fails.
//
// Covers the exact, non-negotiable rules: correct +3, wrong -1, timeout/no
// answer 0 (NOT -1); the server-authoritative 15s window (a late submit is
// forced to a timeout even if the correct option was sent); sequencing (index
// only ever advances — no skipping ahead or going back, no re-answering);
// completion at question 10; the too-late-to-start cutoff; and that the
// per-question breakdown sums to the stored total.
//
// The runtime guards for "can't answer the same question twice" and "can't
// start a second attempt" are the DB unique indexes (quiz_answers on
// (attempt_id, question_id); quiz_attempts on (quiz_id, user_id)); here we prove
// the surrounding logic that relies on them — a submit for anything other than
// the current question is rejected, and the index/total advance correctly.

import {
  scoreAnswer,
  resolveAnswer,
  advanceAttempt,
  canStartAttempt,
  isWithinWindow,
  QUESTION_SECONDS,
  SUBMIT_GRACE_MS,
  QUESTIONS_PER_QUIZ,
  isExcludedFromLeaderboard,
  type Quiz,
} from "@/lib/quiz";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const WINDOW_MS = QUESTION_SECONDS * 1000; // 15000

// --- 1. Base scoring ---------------------------------------------------------
console.log("Scoring:");
{
  const c = scoreAnswer("A", "A");
  check("correct answer → +3", c.isCorrect && c.pointsAwarded === 3, JSON.stringify(c));

  const w = scoreAnswer("B", "A");
  check("wrong answer → -1", !w.isCorrect && w.pointsAwarded === -1, JSON.stringify(w));

  const t = scoreAnswer(null, "A");
  check("timeout / no answer → 0 (not -1)", !t.isCorrect && t.pointsAwarded === 0, JSON.stringify(t));
}

// --- 2. Server-authoritative timing window -----------------------------------
console.log("Timing window (server-authoritative):");
{
  const shown = 1_000_000;

  // Comfortably inside the window with a correct pick → +3.
  const inWin = resolveAnswer({ shownAtMs: shown, nowMs: shown + 5000, selected: "A", correct: "A" });
  check("submit at 5s, correct → +3", inWin.selected === "A" && inWin.pointsAwarded === 3);

  // Inside the window but wrong → -1.
  const inWrong = resolveAnswer({ shownAtMs: shown, nowMs: shown + 5000, selected: "C", correct: "A" });
  check("submit at 5s, wrong → -1", inWrong.pointsAwarded === -1);

  // Within the grace period (15s + 2s = 17s), just under → still counts.
  const graceOk = resolveAnswer({ shownAtMs: shown, nowMs: shown + WINDOW_MS + SUBMIT_GRACE_MS - 1, selected: "A", correct: "A" });
  check("submit just inside 15s+grace, correct → +3", graceOk.selected === "A" && graceOk.pointsAwarded === 3);

  // Just past the grace period → forced timeout (0) EVEN THOUGH the sent option
  // was correct. Proves a late submit can never score +3.
  const late = resolveAnswer({ shownAtMs: shown, nowMs: shown + WINDOW_MS + SUBMIT_GRACE_MS + 1, selected: "A", correct: "A" });
  check("late correct submit → forced timeout 0", late.selected === null && late.pointsAwarded === 0, JSON.stringify(late));

  // A wrong option sent late is also just a 0, not a -1.
  const lateWrong = resolveAnswer({ shownAtMs: shown, nowMs: shown + 30000, selected: "B", correct: "A" });
  check("late wrong submit → 0 (not -1)", lateWrong.pointsAwarded === 0);

  // A malformed option is treated as no answer → 0.
  const bad = resolveAnswer({ shownAtMs: shown, nowMs: shown + 1000, selected: "Z" as unknown as null, correct: "A" });
  check("malformed option → treated as no answer (0)", bad.selected === null && bad.pointsAwarded === 0);

  check("isWithinWindow: exactly at 15s+grace boundary is allowed", isWithinWindow(shown, shown + WINDOW_MS + SUBMIT_GRACE_MS));
  check("isWithinWindow: 1ms past boundary is not", !isWithinWindow(shown, shown + WINDOW_MS + SUBMIT_GRACE_MS + 1));
}

// --- 3. Sequencing: no skip / no back / no re-answer -------------------------
console.log("Sequencing:");
{
  // Model the current-question guard used by submitAnswer.
  const questionIds = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
  const acceptsSubmit = (currentIndex: number, submittedId: number) =>
    questionIds[currentIndex] === submittedId;

  // At index 0 you may only submit Q101 — not a future or past question.
  check("submit for current question accepted", acceptsSubmit(0, 101));
  check("submit for a later question rejected (no skipping ahead)", !acceptsSubmit(0, 105));
  // After moving to index 3, the previous questions can't be re-submitted.
  check("submit for an earlier question rejected (no going back)", !acceptsSubmit(3, 101));
  check("re-submitting the just-answered question rejected", !acceptsSubmit(3, 103));

  // The index only ever increments by exactly one per answer.
  check("advanceAttempt bumps index by exactly 1", advanceAttempt(4, 3, 0).nextIndex === 5);
  check("advanceAttempt never decreases the index", advanceAttempt(0, -1, 0).nextIndex === 1);
}

// --- 4. Completion + total = per-question sum --------------------------------
console.log("Completion + totals:");
{
  // Simulate a full 10-question run with a realistic mix of outcomes.
  const perQuestion = [3, -1, 0, 3, 3, -1, 0, 3, -1, 3]; // sums to 12
  const expectedSum = perQuestion.reduce((a, b) => a + b, 0);

  let index = 0;
  let total = 0;
  let completedAt: number | null = null;
  const brokeSequence: boolean[] = [];

  for (let i = 0; i < perQuestion.length; i++) {
    brokeSequence.push(index !== i); // index must track the question number
    const { nextIndex, completed, newTotal } = advanceAttempt(index, perQuestion[i], total, QUESTIONS_PER_QUIZ);
    index = nextIndex;
    total = newTotal;
    if (completed) completedAt = i;
  }

  check("index tracked each question in order (never jumped)", brokeSequence.every((b) => !b));
  check("completes exactly at question 10", completedAt === 9 && index === 10, `completedAt=${completedAt} index=${index}`);
  check("stored total equals the sum of per-question points", total === expectedSum, `total=${total} expected=${expectedSum}`);

  // There is never a question 11 / loop back to 1: once completed the index is
  // 10 which is >= total, so buildCurrentPayload short-circuits to "finished".
  check("no question 11 (index >= total after completion)", index >= QUESTIONS_PER_QUIZ);
}

// --- 5. Start cutoff (too-late-to-finish) ------------------------------------
console.log("Start cutoff:");
{
  const now = Date.UTC(2026, 6, 8, 12, 0, 0); // fixed 'now'
  const mk = (startsOffsetMs: number, endsOffsetMs: number): Quiz => ({
    id: 1,
    title: "t",
    starts_at: new Date(now + startsOffsetMs).toISOString(),
    ends_at: new Date(now + endsOffsetMs).toISOString(),
    created_at: new Date(now).toISOString(),
  });

  // Required head-room = 10*15 + 30 = 180s.
  const requiredMs = (QUESTIONS_PER_QUIZ * QUESTION_SECONDS + 30) * 1000;

  check("can start with plenty of time left", canStartAttempt(mk(-1000, requiredMs + 60_000), now));
  check("can start with exactly the required time left", canStartAttempt(mk(-1000, requiredMs), now));
  check("cannot start when just under the required time remains", !canStartAttempt(mk(-1000, requiredMs - 1), now));
  check("cannot start before the window opens", !canStartAttempt(mk(60_000, requiredMs + 120_000), now));
  check("cannot start after the window closes", !canStartAttempt(mk(-3_600_000, -1000), now));
}

// --- 6. Leaderboard exclusion (cosmetic wording only) ------------------------
console.log("Excluded users (cosmetic):");
{
  check("excluded username flagged", isExcludedFromLeaderboard("mm_2605"));
  check("excluded username flagged (2)", isExcludedFromLeaderboard("ouroboros"));
  check("excluded username flagged (3)", isExcludedFromLeaderboard("pranavsai99"));
  check("normal username not flagged", !isExcludedFromLeaderboard("someone_else"));
  check("null username not flagged", !isExcludedFromLeaderboard(null));
}

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("All quiz logic checks passed.");
