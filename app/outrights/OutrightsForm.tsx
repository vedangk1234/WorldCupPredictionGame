"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  SEMI_OPPONENT,
  validateOutrightAnswers,
  type OutrightAnswers,
} from "@/lib/outrights";
import { saveOutrights, lockOutrights } from "./actions";

export interface TeamOption {
  id: number;
  label: string; // "🇫🇷 France"
}
export interface PlayerOption {
  id: number;
  label: string; // "🇫🇷 Kylian Mbappé"
}
export interface PlayerGroup {
  label: string; // team header, e.g. "🇦🇷 Argentina"
  options: PlayerOption[];
}

interface Props {
  locksAt: string;
  serverNow: number;
  teamOptions: TeamOption[];
  bootOptions: PlayerOption[];
  gloveOptions: PlayerOption[];
  ballGroups: PlayerGroup[];
  goalsOptions: number[];
  initial: OutrightAnswers | null;
}

const card: React.CSSProperties = {
  background: "var(--pitch-900)",
  border: "1px solid var(--pitch-line)",
  borderRadius: 14,
  padding: 18,
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--pitch-950)",
  border: "1px solid var(--pitch-line)",
  borderRadius: 8,
  color: "var(--chalk)",
  padding: "10px 12px",
  fontSize: 14.5,
};

function Question({
  n,
  title,
  points,
  children,
}: {
  n: number;
  title: string;
  points: number;
  children: React.ReactNode;
}) {
  return (
    <div style={card}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>
          <span style={{ color: "var(--chalk-dim)", fontWeight: 600 }}>{n}. </span>
          {title}
        </h3>
        <span
          className="tnum"
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: "var(--gold-300)",
            background: "rgba(243,201,105,0.12)",
            border: "1px solid rgba(243,201,105,0.4)",
            borderRadius: 99,
            padding: "2px 10px",
            whiteSpace: "nowrap",
          }}
        >
          {points} pts
        </span>
      </div>
      {children}
    </div>
  );
}

export default function OutrightsForm(props: Props) {
  const {
    locksAt,
    serverNow,
    teamOptions,
    bootOptions,
    gloveOptions,
    ballGroups,
    goalsOptions,
    initial,
  } = props;

  const [champion, setChampion] = useState<number | null>(initial?.championTeamId ?? null);
  const [runnerUp, setRunnerUp] = useState<number | null>(initial?.runnerUpTeamId ?? null);
  const [third, setThird] = useState<number | null>(initial?.thirdPlaceTeamId ?? null);
  const [boot, setBoot] = useState<number | null>(initial?.goldenBootPlayerId ?? null);
  const [ball, setBall] = useState<number | null>(initial?.goldenBallPlayerId ?? null);
  const [glove, setGlove] = useState<number | null>(initial?.goldenGlovePlayerId ?? null);
  const [goals, setGoals] = useState<number | null>(initial?.goldenBootGoals ?? null);

  const [confirmingLock, setConfirmingLock] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // ---- Live countdown to the deadline (server clock anchored) --------------
  const deadlineTs = useMemo(() => new Date(locksAt).getTime(), [locksAt]);
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const mountedAt = Date.now();
    const tick = () => setNow(serverNow + (Date.now() - mountedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [serverNow]);
  const remainingMs = deadlineTs - now;
  const closed = remainingMs <= 0;

  // ---- Champion / runner-up / third cascade --------------------------------
  // Runner-up: exclude the champion AND the champion's semi opponent (they'd
  // have met in the same semi, so both can't reach the final).
  const runnerUpOptions = useMemo(
    () =>
      teamOptions.filter(
        (t) => t.id !== champion && (champion == null || SEMI_OPPONENT[champion] !== t.id),
      ),
    [teamOptions, champion],
  );
  // Third place: exclude champion and runner-up (the two finalists).
  const thirdOptions = useMemo(
    () => teamOptions.filter((t) => t.id !== champion && t.id !== runnerUp),
    [teamOptions, champion, runnerUp],
  );

  // When champion changes, drop a now-invalid runner-up / third selection.
  useEffect(() => {
    if (champion != null) {
      if (runnerUp != null && (runnerUp === champion || SEMI_OPPONENT[champion] === runnerUp)) {
        setRunnerUp(null);
      }
      if (third != null && third === champion) setThird(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [champion]);

  // When runner-up changes, drop a now-invalid third selection.
  useEffect(() => {
    if (runnerUp != null && third != null && third === runnerUp) setThird(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runnerUp]);

  const answers: OutrightAnswers = {
    championTeamId: champion,
    runnerUpTeamId: runnerUp,
    thirdPlaceTeamId: third,
    goldenBootPlayerId: boot,
    goldenBallPlayerId: ball,
    goldenGlovePlayerId: glove,
    goldenBootGoals: goals,
  };
  const validation = validateOutrightAnswers(answers);
  const complete = validation.ok;

  function runSave() {
    setMsg(null);
    if (!validation.ok) {
      setMsg({ ok: false, text: validation.error });
      return;
    }
    startTransition(async () => {
      const res = await saveOutrights(answers);
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  function runLock() {
    setMsg(null);
    if (!validation.ok) {
      setConfirmingLock(false);
      setMsg({ ok: false, text: validation.error });
      return;
    }
    startTransition(async () => {
      const res = await lockOutrights(answers);
      setConfirmingLock(false);
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  const teamSelect = (
    value: number | null,
    onChange: (v: number | null) => void,
    options: TeamOption[],
    placeholder: string,
  ) => (
    <select
      value={value ?? 0}
      onChange={(e) => onChange(Number(e.target.value) || null)}
      style={selectStyle}
      disabled={closed}
    >
      <option value={0}>{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Countdown remainingMs={remainingMs} />

      <Question n={1} title="Champion" points={7}>
        {teamSelect(champion, setChampion, teamOptions, "— pick the winner —")}
      </Question>

      <Question n={2} title="Runner-up" points={3}>
        {teamSelect(runnerUp, setRunnerUp, runnerUpOptions, "— pick the losing finalist —")}
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--chalk-dim)" }}>
          Must be from the other semi-final than your champion.
        </p>
      </Question>

      <Question n={3} title="Third place" points={3}>
        {teamSelect(third, setThird, thirdOptions, "— pick third place —")}
      </Question>

      <Question n={4} title="Golden Boot winner" points={5}>
        <select
          value={boot ?? 0}
          onChange={(e) => setBoot(Number(e.target.value) || null)}
          style={selectStyle}
          disabled={closed}
        >
          <option value={0}>— pick the top scorer —</option>
          {bootOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </Question>

      <Question n={5} title="Golden Ball winner" points={5}>
        <select
          value={ball ?? 0}
          onChange={(e) => setBall(Number(e.target.value) || null)}
          style={selectStyle}
          disabled={closed}
        >
          <option value={0}>— pick the best player —</option>
          {ballGroups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Question>

      <Question n={6} title="Golden Glove winner" points={5}>
        <select
          value={glove ?? 0}
          onChange={(e) => setGlove(Number(e.target.value) || null)}
          style={selectStyle}
          disabled={closed}
        >
          <option value={0}>— pick the best goalkeeper —</option>
          {gloveOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </Question>

      <Question n={7} title="Golden Boot — total goals" points={3}>
        <select
          value={goals ?? 0}
          onChange={(e) => setGoals(Number(e.target.value) || null)}
          style={selectStyle}
          disabled={closed}
        >
          <option value={0}>— pick the exact goal tally —</option>
          {goalsOptions.map((g) => (
            <option key={g} value={g}>
              {g} goals
            </option>
          ))}
        </select>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--chalk-dim)" }}>
          Exact match only — you score 3 pts only if the winner&apos;s tally is exactly right.
        </p>
      </Question>

      {/* Actions */}
      <div style={card}>
        <p style={{ color: "var(--gold-300)", fontSize: 12.5, margin: "0 0 12px" }}>
          Locking is permanent — you can&apos;t edit after locking. Anything not locked before the
          first semi-final doesn&apos;t count.
        </p>

        {closed ? (
          <p style={{ color: "var(--m3)", fontWeight: 600, fontSize: 13.5, margin: 0 }}>
            Outrights are closed. Refresh the page to see the final picks.
          </p>
        ) : confirmingLock ? (
          <div
            style={{
              background: "rgba(243,201,105,0.1)",
              border: "1px solid rgba(243,201,105,0.45)",
              borderRadius: 10,
              padding: 14,
            }}
          >
            <p style={{ margin: "0 0 12px", fontSize: 13.5, fontWeight: 600 }}>
              You can&apos;t edit your outrights after locking. Lock them in?
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={runLock}
                disabled={pending}
                style={{
                  background: "var(--gold-400)",
                  color: "#1a1206",
                  border: "none",
                  borderRadius: 9,
                  padding: "9px 18px",
                  fontWeight: 700,
                  cursor: pending ? "default" : "pointer",
                  opacity: pending ? 0.6 : 1,
                }}
              >
                {pending ? "Locking…" : "Yes, lock it in"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingLock(false)}
                disabled={pending}
                style={{
                  background: "transparent",
                  color: "var(--chalk-dim)",
                  border: "1px solid var(--pitch-line)",
                  borderRadius: 9,
                  padding: "9px 18px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={runSave}
              disabled={pending || !complete}
              style={{
                background: "transparent",
                color: "var(--chalk)",
                border: "1px solid var(--pitch-line)",
                borderRadius: 9,
                padding: "10px 18px",
                fontWeight: 700,
                cursor: pending || !complete ? "default" : "pointer",
                opacity: pending || !complete ? 0.5 : 1,
              }}
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={() => {
                setMsg(null);
                if (!validation.ok) {
                  setMsg({ ok: false, text: validation.error });
                  return;
                }
                setConfirmingLock(true);
              }}
              disabled={pending || !complete}
              style={{
                background: "var(--gold-400)",
                color: "#1a1206",
                border: "none",
                borderRadius: 9,
                padding: "10px 18px",
                fontWeight: 700,
                cursor: pending || !complete ? "default" : "pointer",
                opacity: pending || !complete ? 0.5 : 1,
              }}
            >
              Lock in Outrights
            </button>
            {!complete && (
              <span style={{ fontSize: 12.5, color: "var(--chalk-dim)" }}>
                Answer all 7 questions to save or lock.
              </span>
            )}
          </div>
        )}

        {msg && (
          <p
            style={{
              fontSize: 13,
              marginTop: 12,
              marginBottom: 0,
              color: msg.ok ? "var(--pitch-500)" : "var(--m3)",
              fontWeight: 600,
            }}
          >
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}

function Countdown({ remainingMs }: { remainingMs: number }) {
  const closed = remainingMs <= 0;
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [
    d > 0 ? `${d}d` : null,
    `${String(h).padStart(2, "0")}h`,
    `${String(m).padStart(2, "0")}m`,
    `${String(s).padStart(2, "0")}s`,
  ].filter(Boolean);
  return (
    <div
      style={{
        ...card,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap",
        borderColor: closed ? "rgba(239,71,111,0.4)" : "rgba(243,201,105,0.4)",
        background: closed ? "rgba(239,71,111,0.08)" : "rgba(243,201,105,0.07)",
      }}
    >
      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--chalk-dim)" }}>
        {closed ? "Predictions closed" : "Locks before the first semi-final in"}
      </span>
      <span
        className="display tnum"
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: closed ? "var(--m3)" : "var(--gold-300)",
          letterSpacing: "0.02em",
        }}
      >
        {closed ? "— " : parts.join(" ")}
      </span>
    </div>
  );
}
