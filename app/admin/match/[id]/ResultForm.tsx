"use client";

import { useMemo, useState, useTransition } from "react";
import type { GoalEntry, Stage } from "@/lib/types";
import { isKnockout } from "@/lib/scoring";
import { saveAndCompute, type SaveExtras } from "../../actions";
import { buildScorerGroups, type ScorerOptionGroup } from "@/lib/scorer-options";

interface FormPlayer {
  id: number;
  name: string;
  position: string | null;
  shirt_number: number | null;
  team_id: number;
}

interface FormTeam {
  id: number;
  name: string;
  flag: string | null;
}

interface Props {
  matchId: number;
  stage: Stage;
  teamA: FormTeam;
  teamB: FormTeam;
  players: FormPlayer[];
  initialScoreA: number | null;
  initialScoreB: number | null;
  initialGoals: GoalEntry[];
  initialEtScoreA: number | null;
  initialEtScoreB: number | null;
  initialEtGoals: GoalEntry[];
  initialPenWinnerTeamId: number | null;
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

// Reusable goal-row editor for either the FT or ET scorer list.
function GoalEditor({
  goals,
  scorerGroups,
  onAdd,
  onRemove,
  onUpdate,
  addLabel,
}: {
  goals: GoalRow[];
  scorerGroups: ScorerOptionGroup[];
  onAdd: () => void;
  onRemove: (uid: number) => void;
  onUpdate: (uid: number, patch: Partial<GoalRow>) => void;
  addLabel: string;
}) {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {goals.map((g) => (
          <div
            key={g.uid}
            style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
          >
            <select
              value={g.player_id}
              onChange={(e) => onUpdate(g.uid, { player_id: Number(e.target.value) })}
              style={selectStyle}
            >
              <option value={0}>— select scorer —</option>
              {scorerGroups.map((grp) => (
                <optgroup key={grp.label} label={grp.label}>
                  {grp.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <input
              type="text"
              placeholder="min (45+2)"
              value={g.minute}
              onChange={(e) => onUpdate(g.uid, { minute: e.target.value })}
              style={textInput}
            />

            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={g.is_own_goal}
                onChange={(e) => onUpdate(g.uid, { is_own_goal: e.target.checked })}
                style={{ accentColor: "var(--gold-400)" }}
              />
              Own goal
            </label>

            <button
              type="button"
              onClick={() => onRemove(g.uid)}
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
        onClick={onAdd}
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
        {addLabel}
      </button>
    </>
  );
}

export default function ResultForm({
  matchId,
  stage,
  teamA,
  teamB,
  players,
  initialScoreA,
  initialScoreB,
  initialGoals,
  initialEtScoreA,
  initialEtScoreB,
  initialEtGoals,
  initialPenWinnerTeamId,
  finished,
}: Props) {
  const knockout = isKnockout(stage);

  const [scoreA, setScoreA] = useState(initialScoreA === null ? "" : String(initialScoreA));
  const [scoreB, setScoreB] = useState(initialScoreB === null ? "" : String(initialScoreB));
  const [goals, setGoals] = useState<GoalRow[]>(
    initialGoals.map((g) => ({ ...g, uid: uidSeq++ })),
  );

  const [etScoreA, setEtScoreA] = useState(
    initialEtScoreA === null ? "" : String(initialEtScoreA),
  );
  const [etScoreB, setEtScoreB] = useState(
    initialEtScoreB === null ? "" : String(initialEtScoreB),
  );
  const [etGoals, setEtGoals] = useState<GoalRow[]>(
    initialEtGoals.map((g) => ({ ...g, uid: uidSeq++ })),
  );
  const [penWinner, setPenWinner] = useState<number | null>(initialPenWinnerTeamId);

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savePending, startSave] = useTransition();
  const busy = savePending;

  const teamOf = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of players) map.set(p.id, p.team_id);
    return map;
  }, [players]);

  // Grouped scorer options: per (team, position) optgroups, GK→DEF→MID→FWD,
  // shirt-number order within each. Shared by the FT and ET scorer lists.
  const scorerGroups = useMemo(
    () =>
      buildScorerGroups([
        {
          name: teamA.name,
          flag: teamA.flag,
          players: players.filter((p) => p.team_id === teamA.id),
        },
        {
          name: teamB.name,
          flag: teamB.flag,
          players: players.filter((p) => p.team_id === teamB.id),
        },
      ]),
    [players, teamA, teamB],
  );

  const numA = Number(scoreA);
  const numB = Number(scoreB);
  const numEtA = Number(etScoreA);
  const numEtB = Number(etScoreB);

  const ftFilled =
    scoreA !== "" && scoreB !== "" && Number.isInteger(numA) && Number.isInteger(numB);
  const ftIsDraw = ftFilled && numA === numB;
  // ET / penalty inputs only matter for a knockout whose FT ended level.
  const showEt = knockout && ftIsDraw;
  const etFilled =
    etScoreA !== "" && etScoreB !== "" && Number.isInteger(numEtA) && Number.isInteger(numEtB);
  const etIsDraw = showEt && etFilled && numEtA === numEtB;
  const showPen = etIsDraw;

  // Soft validation: a team's score should equal its normal goals plus the
  // OPPONENT's own goals (an own goal benefits the other team).
  function tallyGoals(rows: GoalRow[]) {
    let forA = 0;
    let forB = 0;
    for (const g of rows) {
      if (g.player_id === 0) continue;
      const t = teamOf.get(g.player_id);
      if (g.is_own_goal) {
        if (t === teamA.id) forB += 1;
        else if (t === teamB.id) forA += 1;
      } else {
        if (t === teamA.id) forA += 1;
        else if (t === teamB.id) forB += 1;
      }
    }
    return { forA, forB };
  }

  const ftTally = tallyGoals(goals);
  const warnA = scoreA !== "" && Number.isInteger(numA) && ftTally.forA !== numA;
  const warnB = scoreB !== "" && Number.isInteger(numB) && ftTally.forB !== numB;

  // ET goals are the goals scored DURING extra time, so the ET TOTAL for a team
  // should equal its FT score plus its extra-time goals.
  const etTally = tallyGoals(etGoals);
  const warnEtA = showEt && etScoreA !== "" && Number.isInteger(numEtA) && numA + etTally.forA !== numEtA;
  const warnEtB = showEt && etScoreB !== "" && Number.isInteger(numEtB) && numB + etTally.forB !== numEtB;

  // -- FT goal mutators --
  function addGoal() {
    setGoals((g) => [...g, { uid: uidSeq++, player_id: 0, minute: "", is_own_goal: false }]);
  }
  function removeGoal(uid: number) {
    setGoals((g) => g.filter((r) => r.uid !== uid));
  }
  function updateGoal(uid: number, patch: Partial<GoalRow>) {
    setGoals((g) => g.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }
  // -- ET goal mutators --
  function addEtGoal() {
    setEtGoals((g) => [...g, { uid: uidSeq++, player_id: 0, minute: "", is_own_goal: false }]);
  }
  function removeEtGoal(uid: number) {
    setEtGoals((g) => g.filter((r) => r.uid !== uid));
  }
  function updateEtGoal(uid: number, patch: Partial<GoalRow>) {
    setEtGoals((g) => g.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }

  function cleanGoals(rows: GoalRow[]): GoalEntry[] | null {
    const out: GoalEntry[] = [];
    for (const g of rows) {
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
    const cleaned = cleanGoals(goals);
    if (cleaned === null) {
      setMsg({ ok: false, text: "Every goal row needs a player selected (or remove it)." });
      return;
    }

    let extras: SaveExtras = {
      stage,
      etScoreA: null,
      etScoreB: null,
      penWinnerTeamId: null,
      etGoals: [],
    };

    if (showEt) {
      if (
        etScoreA === "" ||
        etScoreB === "" ||
        !Number.isInteger(numEtA) ||
        !Number.isInteger(numEtB) ||
        numEtA < 0 ||
        numEtB < 0
      ) {
        setMsg({ ok: false, text: "Enter the extra-time totals as whole numbers (0 or more)." });
        return;
      }
      if (numEtA < numA || numEtB < numB) {
        setMsg({ ok: false, text: "Extra-time totals can't be lower than the full-time score." });
        return;
      }
      const cleanedEt = cleanGoals(etGoals);
      if (cleanedEt === null) {
        setMsg({ ok: false, text: "Every extra-time goal row needs a player selected (or remove it)." });
        return;
      }
      let pen: number | null = null;
      if (numEtA === numEtB) {
        if (penWinner !== teamA.id && penWinner !== teamB.id) {
          setMsg({ ok: false, text: "Extra time was level — pick the penalty shoot-out winner." });
          return;
        }
        pen = penWinner;
      }
      extras = {
        stage,
        etScoreA: numEtA,
        etScoreB: numEtB,
        penWinnerTeamId: pen,
        etGoals: cleanedEt,
      };
    }

    startSave(async () => {
      const res = await saveAndCompute(matchId, numA, numB, cleaned, extras);
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {knockout && (
        <div
          style={{
            fontSize: 12.5,
            color: "var(--gold-300)",
            background: "rgba(243,201,105,0.1)",
            border: "1px solid rgba(243,201,105,0.4)",
            borderRadius: 8,
            padding: "8px 12px",
          }}
        >
          ⚔ Knockout match. Enter the <strong>90-minute (full-time)</strong> score below. If it&apos;s a
          draw, extra-time + penalty fields appear.
        </div>
      )}

      {/* FULL-TIME SCORE */}
      <div style={card}>
        <h2 className="display" style={{ fontSize: 17, margin: "0 0 14px" }}>
          {knockout ? "Full-time score (90 mins)" : "Final score"}
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>
              {teamA.flag ? `${teamA.flag} ` : ""}
              {teamA.name}
            </span>
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
            <span style={{ fontWeight: 600 }}>
              {teamB.flag ? `${teamB.flag} ` : ""}
              {teamB.name}
            </span>
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

      {/* FULL-TIME GOAL SCORERS */}
      <div style={card}>
        <h2 className="display" style={{ fontSize: 17, margin: "0 0 4px" }}>
          {knockout ? "Full-time goal scorers" : "Goal scorers"}
        </h2>
        <p style={{ color: "var(--chalk-dim)", fontSize: 13, margin: "0 0 6px" }}>
          One row per goal — add a player twice for a brace. For an <strong>own goal</strong>,
          pick the player from the team that <em>conceded</em> (the OG benefits the
          other team); a backer of that player loses 1 point.
        </p>
        <p style={{ color: "var(--chalk-dim)", fontSize: 12, opacity: 0.7, margin: "0 0 14px" }}>
          Minute (optional) is stored for display only — it does not affect points.
        </p>

        <GoalEditor
          goals={goals}
          scorerGroups={scorerGroups}
          onAdd={addGoal}
          onRemove={removeGoal}
          onUpdate={updateGoal}
          addLabel="+ Add goal"
        />

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
                {teamA.name}: {ftTally.forA} goal(s) vs score {scoreA}
              </div>
            )}
            {warnB && (
              <div>
                {teamB.name}: {ftTally.forB} goal(s) vs score {scoreB}
              </div>
            )}
            <div style={{ opacity: 0.8 }}>
              (Just a heads-up — penalties/data order can differ. You can still save.)
            </div>
          </div>
        )}
      </div>

      {/* EXTRA TIME (knockout, drawn FT) */}
      {showEt && (
        <>
          <div style={card}>
            <h2 className="display" style={{ fontSize: 17, margin: "0 0 6px" }}>
              Extra-time score (total after ET)
            </h2>
            <p style={{ color: "var(--chalk-dim)", fontSize: 13, margin: "0 0 14px" }}>
              Enter the <strong>total</strong> score after extra time (it includes the full-time
              goals). Must be at least the full-time score.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>
                  {teamA.flag ? `${teamA.flag} ` : ""}
                  {teamA.name}
                </span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={etScoreA}
                  onChange={(e) => setEtScoreA(e.target.value)}
                  style={numInput}
                />
              </label>
              <span className="display" style={{ fontSize: 20, color: "var(--chalk-dim)", marginTop: 18 }}>
                –
              </span>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>
                  {teamB.flag ? `${teamB.flag} ` : ""}
                  {teamB.name}
                </span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={etScoreB}
                  onChange={(e) => setEtScoreB(e.target.value)}
                  style={numInput}
                />
              </label>
            </div>
          </div>

          <div style={card}>
            <h2 className="display" style={{ fontSize: 17, margin: "0 0 4px" }}>
              Extra-time goal scorers
            </h2>
            <p style={{ color: "var(--chalk-dim)", fontSize: 13, margin: "0 0 14px" }}>
              One row per goal scored <strong>during extra time</strong> (the goals beyond
              full-time). Same rules as above.
            </p>

            <GoalEditor
              goals={etGoals}
              scorerGroups={scorerGroups}
              onAdd={addEtGoal}
              onRemove={removeEtGoal}
              onUpdate={updateEtGoal}
              addLabel="+ Add extra-time goal"
            />

            {(warnEtA || warnEtB) && (
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
                ⚠ ET goals + full-time score don’t add up to the ET total:
                {warnEtA && (
                  <div>
                    {teamA.name}: {numA} (FT) + {etTally.forA} (ET) vs ET total {etScoreA}
                  </div>
                )}
                {warnEtB && (
                  <div>
                    {teamB.name}: {numB} (FT) + {etTally.forB} (ET) vs ET total {etScoreB}
                  </div>
                )}
                <div style={{ opacity: 0.8 }}>(Heads-up only — you can still save.)</div>
              </div>
            )}
          </div>
        </>
      )}

      {/* PENALTY SHOOT-OUT WINNER (knockout, level after ET) */}
      {showPen && (
        <div style={card}>
          <h2 className="display" style={{ fontSize: 17, margin: "0 0 6px" }}>
            Penalty shoot-out winner
          </h2>
          <p style={{ color: "var(--chalk-dim)", fontSize: 13, margin: "0 0 14px" }}>
            Extra time was level — record who won on penalties.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[teamA, teamB].map((t) => {
              const active = penWinner === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPenWinner(t.id)}
                  style={{
                    background: active ? "var(--gold-400)" : "var(--pitch-800)",
                    color: active ? "#1a1206" : "var(--chalk)",
                    border: active ? "none" : "1px solid var(--pitch-line)",
                    borderRadius: 9,
                    padding: "9px 16px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {t.flag ? `${t.flag} ` : ""}
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ACTIONS */}
      <div style={card}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={doSave} disabled={busy} style={primaryBtn(busy)}>
            {savePending ? "Saving…" : "Save & compute"}
          </button>
        </div>
        <p style={{ color: "var(--chalk-dim)", fontSize: 12.5, margin: "12px 0 0" }}>
          One step: saves the score{knockout ? " (+ ET / penalties)" : ""} + scorers, marks the
          match <strong>finished</strong>, and runs the scoring engine over every{" "}
          <strong>locked</strong> prediction (unlocked = out of the match, skipped).
          Idempotent — re-open this match, correct the result, and{" "}
          {finished ? "save again" : "save"} to overwrite and recompute cleanly.
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
