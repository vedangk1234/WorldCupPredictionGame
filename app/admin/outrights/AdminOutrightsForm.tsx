"use client";

import { useState, useTransition } from "react";
import { saveOutrightResults, computeOutrightPoints } from "./actions";

export interface TeamOption {
  id: number;
  label: string;
}
export interface PlayerOption {
  id: number;
  label: string;
}
export interface PlayerGroup {
  label: string;
  options: PlayerOption[];
}

interface Props {
  teamOptions: TeamOption[];
  bootOptions: PlayerOption[];
  gloveOptions: PlayerOption[];
  ballGroups: PlayerGroup[];
  goalsOptions: number[];
  initial: {
    championTeamId: number | null;
    runnerUpTeamId: number | null;
    thirdPlaceTeamId: number | null;
    goldenBootPlayerId: number | null;
    goldenBallPlayerId: number | null;
    goldenGlovePlayerId: number | null;
    goldenBootGoals: number | null;
    finalised: boolean;
  } | null;
  lockedCount: number;
}

const box: React.CSSProperties = {
  background: "var(--pitch-900)",
  border: "1px solid var(--pitch-line)",
  borderRadius: 12,
  padding: 16,
};
const selectStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--pitch-950)",
  border: "1px solid var(--pitch-line)",
  borderRadius: 8,
  color: "var(--chalk)",
  padding: "9px 11px",
  fontSize: 14,
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--chalk-dim)",
  marginBottom: 6,
};

export default function AdminOutrightsForm(props: Props) {
  const { teamOptions, bootOptions, gloveOptions, ballGroups, goalsOptions, initial, lockedCount } =
    props;

  const [champion, setChampion] = useState<number | null>(initial?.championTeamId ?? null);
  const [runnerUp, setRunnerUp] = useState<number | null>(initial?.runnerUpTeamId ?? null);
  const [third, setThird] = useState<number | null>(initial?.thirdPlaceTeamId ?? null);
  const [boot, setBoot] = useState<number | null>(initial?.goldenBootPlayerId ?? null);
  const [ball, setBall] = useState<number | null>(initial?.goldenBallPlayerId ?? null);
  const [glove, setGlove] = useState<number | null>(initial?.goldenGlovePlayerId ?? null);
  const [goals, setGoals] = useState<number | null>(initial?.goldenBootGoals ?? null);
  const [finalised, setFinalised] = useState(initial?.finalised ?? false);

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSave] = useTransition();
  const [computing, startCompute] = useTransition();

  function save() {
    setMsg(null);
    startSave(async () => {
      const res = await saveOutrightResults({
        championTeamId: champion,
        runnerUpTeamId: runnerUp,
        thirdPlaceTeamId: third,
        goldenBootPlayerId: boot,
        goldenBallPlayerId: ball,
        goldenGlovePlayerId: glove,
        goldenBootGoals: goals,
        finalised,
      });
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  function compute() {
    setMsg(null);
    startCompute(async () => {
      const res = await computeOutrightPoints();
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  const numSelect = (
    value: number | null,
    onChange: (v: number | null) => void,
    placeholder: string,
    options: { id: number; label: string }[],
  ) => (
    <select
      value={value ?? 0}
      onChange={(e) => onChange(Number(e.target.value) || null)}
      style={selectStyle}
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
      <div style={box}>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={labelStyle}>Champion (7 pts)</label>
            {numSelect(champion, setChampion, "— not set —", teamOptions)}
          </div>
          <div>
            <label style={labelStyle}>Runner-up (3 pts)</label>
            {numSelect(runnerUp, setRunnerUp, "— not set —", teamOptions)}
          </div>
          <div>
            <label style={labelStyle}>Third place (3 pts)</label>
            {numSelect(third, setThird, "— not set —", teamOptions)}
          </div>
          <div>
            <label style={labelStyle}>Golden Boot winner (5 pts)</label>
            {numSelect(boot, setBoot, "— not set —", bootOptions)}
          </div>
          <div>
            <label style={labelStyle}>Golden Ball winner (5 pts)</label>
            <select
              value={ball ?? 0}
              onChange={(e) => setBall(Number(e.target.value) || null)}
              style={selectStyle}
            >
              <option value={0}>— not set —</option>
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
          </div>
          <div>
            <label style={labelStyle}>Golden Glove winner (5 pts)</label>
            {numSelect(glove, setGlove, "— not set —", gloveOptions)}
          </div>
          <div>
            <label style={labelStyle}>Golden Boot — total goals (3 pts, exact)</label>
            <select
              value={goals ?? 0}
              onChange={(e) => setGoals(Number(e.target.value) || null)}
              style={selectStyle}
            >
              <option value={0}>— not set —</option>
              {goalsOptions.map((g) => (
                <option key={g} value={g}>
                  {g} goals
                </option>
              ))}
            </select>
          </div>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 16,
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={finalised}
            onChange={(e) => setFinalised(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          Finalise results (show correct/wrong + points to players)
        </label>

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              background: "var(--gold-400)",
              color: "#1a1206",
              border: "none",
              borderRadius: 9,
              padding: "10px 18px",
              fontWeight: 700,
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving…" : "Save results"}
          </button>
        </div>
      </div>

      {/* Compute */}
      <div style={box}>
        <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700 }}>Compute points</h3>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--chalk-dim)" }}>
          Scores every locked prediction against the saved results into{" "}
          <code>outright_points</code> (exact-match only). Idempotent — re-run after a correction.{" "}
          {lockedCount} locked prediction(s).
        </p>
        <button
          type="button"
          onClick={compute}
          disabled={computing}
          style={{
            background: "transparent",
            color: "var(--chalk)",
            border: "1px solid var(--pitch-line)",
            borderRadius: 9,
            padding: "10px 18px",
            fontWeight: 700,
            cursor: computing ? "default" : "pointer",
            opacity: computing ? 0.6 : 1,
          }}
        >
          {computing ? "Computing…" : "Compute"}
        </button>
      </div>

      {msg && (
        <p
          style={{
            fontSize: 13.5,
            margin: 0,
            color: msg.ok ? "var(--pitch-500)" : "var(--m3)",
            fontWeight: 600,
          }}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
