"use client";

import { useMemo, useState, useTransition } from "react";
import type { GoalEntry } from "@/lib/types";
import { saveResult, finishMatch, recomputePoints } from "../../actions";

interface FormPlayer {
  id: number;
  name: string;
  position: string | null;
  shirt_number: number | null;
  team_id: number;
}

interface Props {
  matchId: number;
  teamA: { id: number; name: string };
  teamB: { id: number; name: string };
  players: FormPlayer[];
  initialScoreA: number | null;
  initialScoreB: number | null;
  initialGoals: GoalEntry[];
  finished: boolean;
}

// Goal rows carry a client-only uid so React keys stay stable across add/remove.
interface GoalRow extends GoalEntry {
  uid: number;
}

const card: React.CSSProperties = {
  background: "var(--pitch-900)",
  border: "1px solid var(--pitch-line)",
  borderRadius: 12,
  padding: 18,
};

const numInput: React.CSSProperties = {
  width: 64,
  background: "var(--pitch-950)",
  border: "1px solid var(--pitch-line)",
  borderRadius: 8,
  color: "var(--chalk)",
  fontSize: 22,
  fontWeight: 800,
  textAlign: "center",
  padding: "8px 6px",
};

const selectStyle: React.CSSProperties = {
  flex: "1 1 220px",
  minWidth: 200,
  background: "var(--pitch-950)",
  border: "1px solid var(--pitch-line)",
  borderRadius: 8,
  color: "var(--chalk)",
  padding: "8px 10px",
  fontSize: 14,
};

const textInput: React.CSSProperties = {
  width: 84,
  background: "var(--pitch-950)",
  border: "1px solid var(--pitch-line)",
  borderRadius: 8,
  color: "var(--chalk)",
  padding: "8px 8px",
  fontSize: 14,
};

function primaryBtn(disabled: boolean, gold = true): React.CSSProperties {
  return {
    background: gold ? "var(--gold-400)" : "var(--pitch-800)",
    color: gold ? "#1a1206" : "var(--chalk)",
    border: gold ? "none" : "1px solid var(--pitch-line)",
    borderRadius: 9,
    padding: "10px 18px",
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

let uidSeq = 1;

export default function ResultForm({
  matchId,
  teamA,
  teamB,
  players,
  initialScoreA,
  initialScoreB,
  initialGoals,
  finished,
}: Props) {
  const [scoreA, setScoreA] = useState(initialScoreA === null ? "" : String(initialScoreA));
  const [scoreB, setScoreB] = useState(initialScoreB === null ? "" : String(initialScoreB));
  const [goals, setGoals] = useState<GoalRow[]>(
    initialGoals.map((g) => ({ ...g, uid: uidSeq++ })),
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savePending, startSave] = useTransition();
  const [finishPending, startFinish] = useTransition();
  const [recomputePending, startRecompute] = useTransition();
  const busy = savePending || finishPending || recomputePending;

  const teamOf = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of players) map.set(p.id, p.team_id);
    return map;
  }, [players]);

  const grouped = useMemo(() => {
    const a = players.filter((p) => p.team_id === teamA.id);
    const b = players.filter((p) => p.team_id === teamB.id);
    return [
      { team: teamA, list: a },
      { team: teamB, list: b },
    ];
  }, [players, teamA, teamB]);

  // Soft validation: a team's score should equal its normal goals plus the
  // OPPONENT's own goals (an own goal benefits the other team).
  const numA = Number(scoreA);
  const numB = Number(scoreB);
  let normalForA = 0;
  let normalForB = 0;
  for (const g of goals) {
    if (g.player_id === 0) continue;
    const t = teamOf.get(g.player_id);
    if (g.is_own_goal) {
      if (t === teamA.id) normalForB += 1; // A's player OG → benefits B
      else if (t === teamB.id) normalForA += 1;
    } else {
      if (t === teamA.id) normalForA += 1;
      else if (t === teamB.id) normalForB += 1;
    }
  }
  const warnA = scoreA !== "" && Number.isInteger(numA) && normalForA !== numA;
  const warnB = scoreB !== "" && Number.isInteger(numB) && normalForB !== numB;

  function addGoal() {
    setGoals((g) => [...g, { uid: uidSeq++, player_id: 0, minute: "", is_own_goal: false }]);
  }
  function removeGoal(uid: number) {
    setGoals((g) => g.filter((r) => r.uid !== uid));
  }
  function updateGoal(uid: number, patch: Partial<GoalRow>) {
    setGoals((g) => g.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }

  function cleanGoals(): GoalEntry[] | null {
    const out: GoalEntry[] = [];
    for (const g of goals) {
      if (g.player_id === 0) return null; // a row is missing its player
      out.push({ player_id: g.player_id, minute: g.minute, is_own_goal: g.is_own_goal });
    }
    return out;
  }

  function doSave() {
    setMsg(null);
    if (scoreA === "" || scoreB === "" || !Number.isInteger(numA) || !Number.isInteger(numB) || numA < 0 || numB < 0) {
      setMsg({ ok: false, text: "Enter both scores as whole numbers (0 or more)." });
      return;
    }
    const cleaned = cleanGoals();
    if (cleaned === null) {
      setMsg({ ok: false, text: "Every goal row needs a player selected (or remove it)." });
      return;
    }
    startSave(async () => {
      const res = await saveResult(matchId, numA, numB, cleaned);
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  function doFinish() {
    setMsg(null);
    startFinish(async () => {
      const res = await finishMatch(matchId);
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  function doRecompute() {
    setMsg(null);
    startRecompute(async () => {
      const res = await recomputePoints(matchId);
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* SCORE */}
      <div style={card}>
        <h2 className="display" style={{ fontSize: 17, margin: "0 0 14px" }}>
          Final score
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{teamA.name}</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={scoreA}
              onChange={(e) => setScoreA(e.target.value)}
              style={numInput}
            />
          </label>
          <span className="display" style={{ fontSize: 20, color: "var(--chalk-dim)", marginTop: 18 }}>
            –
          </span>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{teamB.name}</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={scoreB}
              onChange={(e) => setScoreB(e.target.value)}
              style={numInput}
            />
          </label>
        </div>
      </div>

      {/* GOAL SCORERS */}
      <div style={card}>
        <h2 className="display" style={{ fontSize: 17, margin: "0 0 4px" }}>
          Goal scorers
        </h2>
        <p style={{ color: "var(--chalk-dim)", fontSize: 13, margin: "0 0 6px" }}>
          One row per goal — add a player twice for a brace. For an <strong>own goal</strong>,
          pick the player from the team that <em>conceded</em> (the OG benefits the
          other team); a backer of that player loses 1 point.
        </p>
        <p style={{ color: "var(--chalk-dim)", fontSize: 12, opacity: 0.7, margin: "0 0 14px" }}>
          Minute (optional) is stored for display only — it does not affect points.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {goals.map((g) => (
            <div
              key={g.uid}
              style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
            >
              <select
                value={g.player_id}
                onChange={(e) => updateGoal(g.uid, { player_id: Number(e.target.value) })}
                style={selectStyle}
              >
                <option value={0}>— select scorer —</option>
                {grouped.map((grp) => (
                  <optgroup key={grp.team.id} label={grp.team.name}>
                    {grp.list.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.shirt_number != null ? `#${p.shirt_number} ` : ""}
                        {p.name}
                        {p.position ? ` (${p.position})` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <input
                type="text"
                placeholder="min (45+2)"
                value={g.minute}
                onChange={(e) => updateGoal(g.uid, { minute: e.target.value })}
                style={textInput}
              />

              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={g.is_own_goal}
                  onChange={(e) => updateGoal(g.uid, { is_own_goal: e.target.checked })}
                  style={{ accentColor: "var(--gold-400)" }}
                />
                Own goal
              </label>

              <button
                type="button"
                onClick={() => removeGoal(g.uid)}
                aria-label="Remove goal"
                style={{
                  background: "transparent",
                  border: "1px solid var(--pitch-line)",
                  color: "var(--chalk-dim)",
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addGoal}
          style={{
            marginTop: 12,
            background: "transparent",
            border: "1px dashed var(--pitch-line)",
            color: "var(--chalk)",
            borderRadius: 9,
            padding: "8px 14px",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          + Add goal
        </button>

        {(warnA || warnB) && (
          <div
            style={{
              marginTop: 14,
              fontSize: 13,
              color: "var(--gold-300)",
              background: "rgba(243,201,105,0.1)",
              border: "1px solid rgba(243,201,105,0.4)",
              borderRadius: 8,
              padding: "8px 12px",
            }}
          >
            ⚠ Goals entered don’t match the score:
            {warnA && (
              <div>
                {teamA.name}: {normalForA} goal(s) vs score {scoreA}
              </div>
            )}
            {warnB && (
              <div>
                {teamB.name}: {normalForB} goal(s) vs score {scoreB}
              </div>
            )}
            <div style={{ opacity: 0.8 }}>
              (Just a heads-up — penalties/data order can differ. You can still save.)
            </div>
          </div>
        )}
      </div>

      {/* ACTIONS */}
      <div style={card}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={doSave} disabled={busy} style={primaryBtn(busy)}>
            {savePending ? "Saving…" : "Save result (draft)"}
          </button>
          <button
            type="button"
            onClick={doFinish}
            disabled={busy}
            style={primaryBtn(busy, false)}
          >
            {finishPending ? "Finishing…" : finished ? "Re-finish + recompute" : "Mark finished + recompute"}
          </button>
          {finished && (
            <button
              type="button"
              onClick={doRecompute}
              disabled={busy}
              style={primaryBtn(busy, false)}
            >
              {recomputePending ? "Recomputing…" : "Recompute points"}
            </button>
          )}
        </div>
        <p style={{ color: "var(--chalk-dim)", fontSize: 12.5, margin: "12px 0 0" }}>
          Save the draft first to get the result right. “Mark finished” and
          “Recompute” run the scoring engine over the <strong>saved</strong> result
          for every <strong>locked</strong> prediction (unlocked = out of the match,
          skipped). Recompute is idempotent — safe to re-run after a correction.
        </p>
        {msg && (
          <p
            style={{
              fontSize: 13.5,
              marginTop: 12,
              color: msg.ok ? "var(--pitch-500)" : "var(--m3)",
              fontWeight: 600,
            }}
          >
            {msg.text}
          </p>
        )}
      </div>
    </section>
  );
}
