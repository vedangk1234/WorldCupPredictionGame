"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { fmtTime, fmtTimeOnly } from "@/lib/format";
import { lockPrediction } from "./actions";
import MatchLeaderboard from "./MatchLeaderboard";
import { buildScorerGroups } from "@/lib/scorer-options";

export type MatchState = "open" | "locked" | "closed" | "finished";

export interface CardPlayer {
  id: number;
  name: string;
  position: string | null;
  shirt_number: number | null;
  team_id: number;
}

export interface CardPrediction {
  scoreA: number;
  scoreB: number;
  locked: boolean;
  scorerIds: number[];
  used2x: boolean;
}

export interface RevealRow {
  userId: string;
  name: string;
  username: string;
  scoreA: number;
  scoreB: number;
  scorerIds: number[];
  used2x: boolean;
  isMe: boolean;
}

// One row of the per-match POINTS breakdown (finished matches only). These are
// points (not counts) and DO sum to totalPts — see CLAUDE.md §2.5.
export interface MatchPointsRow {
  userId: string;
  name: string;
  username: string;
  winnerPts: number;
  gdPts: number;
  exactPts: number;
  scorerPts: number;
  underdogPts: number;
  totalPts: number;
  // Did this player use a "2x" doubler on this match? If so totalPts is already
  // the doubled value (the doubling is applied in the recompute layer).
  used2x: boolean;
}

export interface CardTeam {
  id: number;
  name: string;
  code: string | null;
  flag_url: string | null;
}

// One actual goal in a finished match (for the scorers line under full-time).
// `teamId` is the scorer's own team. A normal goal counts FOR that team; an own
// goal counts FOR the opposing team (CLAUDE.md §2.2). `minute` is display-only.
export interface MatchGoalRow {
  playerName: string;
  teamId: number;
  minute: string | null;
  isOwnGoal: boolean;
}

interface Props {
  matchId: number;
  groupLetter: string | null;
  matchday: number | null;
  kickoffAt: string;
  closeAt: string;
  // The logged-in user's own display zone (profiles.timezone, default
  // "Asia/Kolkata"). Display only — the real lock instant is unchanged.
  userTimeZone: string;
  teamA: CardTeam;
  teamB: CardTeam;
  underdog: CardTeam | null;
  finalScoreA: number | null;
  finalScoreB: number | null;
  squadA: CardPlayer[];
  squadB: CardPlayer[];
  myPrediction: CardPrediction | null;
  state: MatchState;
  isNextOpen: boolean;
  // "2x" eligibility inputs. isRound2 is computed by kickoff order server-side;
  // a match is 2x-eligible when isRound2 AND there is no underdog. tokensUsed is
  // how many of the user's 3 doublers are already spent (across all matches).
  isRound2: boolean;
  tokensUsed: number;
  reveal: RevealRow[];
  matchPoints: MatchPointsRow[];
  goals: MatchGoalRow[];
  currentUserId: string;
}

// Scorer picks carry a client-only uid so React keys survive add/remove.
interface ScorerRow {
  uid: number;
  playerId: number;
}

let uidSeq = 1;

function flag(team: { flag_url: string | null }): string {
  return team.flag_url ? `${team.flag_url} ` : "";
}

const card: React.CSSProperties = {
  background: "var(--pitch-900)",
  border: "1px solid var(--pitch-line)",
  borderRadius: 14,
  padding: 18,
};

const numInput: React.CSSProperties = {
  width: 60,
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
  minWidth: 180,
  background: "var(--pitch-950)",
  border: "1px solid var(--pitch-line)",
  borderRadius: 8,
  color: "var(--chalk)",
  padding: "8px 10px",
  fontSize: 14,
};

export default function MatchCard(props: Props) {
  const {
    matchId,
    teamA,
    teamB,
    underdog,
    squadA,
    squadB,
    myPrediction,
    state,
    isNextOpen,
    isRound2,
    tokensUsed,
    reveal,
    matchPoints,
    goals,
    currentUserId,
  } = props;

  const editable = state === "open";

  // 2x eligibility (CLAUDE.md "2x tokens"): round-2 AND no underdog. A round-2
  // match WITH an underdog shows an explanatory note instead of the toggle;
  // round-1/3 show no 2x UI at all.
  const twoxEligible = isRound2 && !underdog;
  const TOKENS_MAX = 3;

  const [scoreA, setScoreA] = useState(
    myPrediction ? String(myPrediction.scoreA) : "",
  );
  const [scoreB, setScoreB] = useState(
    myPrediction ? String(myPrediction.scoreB) : "",
  );
  const [scorers, setScorers] = useState<ScorerRow[]>(
    (myPrediction?.scorerIds ?? []).map((playerId) => ({ uid: uidSeq++, playerId })),
  );
  const [trimNote, setTrimNote] = useState<string | null>(null);
  // 2x doubler choice — opt-in, defaults to NO, only ever sent at lock time.
  const [use2x, setUse2x] = useState(false);
  const [confirmingLock, setConfirmingLock] = useState(false);
  // Finished matches collapse to a compact result bar; this toggles its detail.
  const [detailOpen, setDetailOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Grouped scorer options: per (team, position) optgroups, GK→DEF→MID→FWD,
  // shirt-number order within each. Display-only — selecting stores player_id.
  const scorerGroups = useMemo(
    () =>
      buildScorerGroups([
        { name: teamA.name, flag: teamA.flag_url, players: squadA },
        { name: teamB.name, flag: teamB.flag_url, players: squadB },
      ]),
    [teamA.name, teamA.flag_url, teamB.name, teamB.flag_url, squadA, squadB],
  );

  // id → "flag Name" for rendering backed scorers as names.
  const playerName = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of [...squadA, ...squadB]) map.set(p.id, p.name);
    return map;
  }, [squadA, squadB]);

  const numA = scoreA === "" ? 0 : Number(scoreA);
  const numB = scoreB === "" ? 0 : Number(scoreB);
  const validScores =
    scoreA !== "" &&
    scoreB !== "" &&
    Number.isInteger(numA) &&
    Number.isInteger(numB) &&
    numA >= 0 &&
    numB >= 0;
  const cap = validScores ? numA + numB : 0;

  // If lowering a score makes picks exceed the new cap, trim the extras. Guarded
  // on length so this only fires when the cap actually shrinks past the picks;
  // addScorer never exceeds the cap, so `scorers` need not be an effect dep.
  useEffect(() => {
    if (scorers.length > cap) {
      setScorers((rows) => rows.slice(0, cap));
      setTrimNote(
        `Trimmed scorer picks to ${cap} (your predicted score only allows ${cap}).`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cap]);

  function addScorer() {
    setTrimNote(null);
    setScorers((rows) =>
      rows.length >= cap ? rows : [...rows, { uid: uidSeq++, playerId: 0 }],
    );
  }
  function removeScorer(uid: number) {
    setTrimNote(null);
    setScorers((rows) => rows.filter((r) => r.uid !== uid));
  }
  function setScorerPlayer(uid: number, playerId: number) {
    setScorers((rows) => rows.map((r) => (r.uid === uid ? { ...r, playerId } : r)));
  }

  function cleanPicks(): number[] {
    return Array.from(
      new Set(scorers.map((r) => r.playerId).filter((id) => id !== 0)),
    );
  }

  function doLock() {
    setMsg(null);
    if (!validScores) {
      setConfirmingLock(false);
      setMsg({ ok: false, text: "Enter both scores as whole numbers (0 or more)." });
      return;
    }
    // Only send 2x when this match is eligible — guards against a stale toggle.
    const send2x = twoxEligible && use2x;
    startTransition(async () => {
      const res = await lockPrediction(matchId, numA, numB, cleanPicks(), send2x);
      setConfirmingLock(false);
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  const dim = state === "finished";
  const highlight = state === "open" && isNextOpen;

  // FINISHED: compact result bar (collapsed) + a separate, independently
  // collapsed match-leaderboard. Both closed by default to save vertical space.
  // Open/Locked/Closed cards are untouched (the main return below).
  if (state === "finished") {
    const hasScore = props.finalScoreA !== null && props.finalScoreB !== null;
    return (
      <div style={{ ...card, padding: 14, opacity: 0.74 }}>
        {/* Result bar — collapsed by default; tap to reveal the full detail. */}
        <button
          type="button"
          onClick={() => setDetailOpen((v) => !v)}
          aria-expanded={detailOpen}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            color: "var(--chalk)",
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
            textAlign: "left",
          }}
        >
          <span style={{ color: "var(--gold-300)", fontSize: 14, flexShrink: 0 }}>
            {detailOpen ? "▾" : "▸"}
          </span>
          <span
            className="display"
            style={{
              flex: "1 1 auto",
              fontSize: 15.5,
              fontWeight: 800,
              lineHeight: 1.3,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              gap: "0 8px",
            }}
          >
            <span>
              {flag(teamA)}
              {teamA.name}
            </span>
            <span className="tnum" style={{ color: "var(--gold-300)" }}>
              {hasScore ? `${props.finalScoreA}–${props.finalScoreB}` : "–"}
            </span>
            <span>
              {flag(teamB)}
              {teamB.name}
            </span>
          </span>
          <StateBadge state={state} isNextOpen={isNextOpen} />
        </button>

        {/* Full finished detail — same content as before, behind the toggle. */}
        {detailOpen && (
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "2px 12px",
                fontSize: 12.5,
                color: "var(--chalk-dim)",
              }}
            >
              <span>
                Group {props.groupLetter ?? "—"}
                {props.matchday ? ` · MD ${props.matchday}` : ""}
              </span>
              <span>Kickoff {fmtTime(props.kickoffAt, props.userTimeZone)}</span>
              <span>Closes {fmtTimeOnly(props.closeAt, props.userTimeZone)}</span>
            </div>

            {hasScore && (
              <div
                className="display"
                style={{
                  marginTop: 12,
                  fontSize: 16,
                  color: "var(--gold-300)",
                  fontWeight: 800,
                }}
              >
                Full time: {teamA.name} {props.finalScoreA}–{props.finalScoreB} {teamB.name}
              </div>
            )}

            <ScorersSummary goals={goals} teamA={teamA} teamB={teamB} />

            {underdog && (
              <div
                style={{
                  marginTop: 12,
                  fontSize: 13,
                  color: "var(--gold-300)",
                  background: "rgba(243,201,105,0.1)",
                  border: "1px solid rgba(243,201,105,0.4)",
                  borderRadius: 8,
                  padding: "7px 11px",
                }}
              >
                ⚡ Underdog: {flag(underdog)}
                {underdog.name} · back them to win for <strong>+5</strong>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              {myPrediction ? (
                <div
                  style={{
                    background: "var(--pitch-950)",
                    border: "1px solid var(--pitch-line)",
                    borderRadius: 10,
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ fontSize: 12, color: "var(--chalk-dim)", marginBottom: 4 }}>
                    Your prediction {myPrediction.locked ? "🔒" : ""}
                  </div>
                  <div className="display" style={{ fontSize: 18, fontWeight: 800 }}>
                    {teamA.name} {myPrediction.scoreA}–{myPrediction.scoreB} {teamB.name}
                  </div>
                  <ScorerLine ids={myPrediction.scorerIds} playerName={playerName} />
                  <TwoXIndicator
                    used2x={myPrediction.used2x}
                    show={myPrediction.used2x || twoxEligible}
                  />
                </div>
              ) : (
                <div style={{ fontSize: 13.5, color: "var(--chalk-dim)" }}>
                  No prediction from you for this match.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Separate, independently-collapsed per-match leaderboard. */}
        <MatchLeaderboard
          teamA={teamA}
          teamB={teamB}
          squadA={squadA}
          squadB={squadB}
          points={matchPoints}
          reveal={reveal}
          currentUserId={currentUserId}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        ...card,
        opacity: dim ? 0.62 : 1,
        borderColor: highlight ? "rgba(31,164,99,0.6)" : "var(--pitch-line)",
        boxShadow: highlight ? "0 0 0 1px rgba(31,164,99,0.35)" : "none",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="display" style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.2 }}>
            {flag(teamA)}
            {teamA.name}
            <span style={{ color: "var(--chalk-dim)", fontWeight: 600, fontSize: 15 }}>
              {" "}
              vs{" "}
            </span>
            {flag(teamB)}
            {teamB.name}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "2px 12px",
              marginTop: 6,
              fontSize: 12.5,
              color: "var(--chalk-dim)",
            }}
          >
            <span>
              Group {props.groupLetter ?? "—"}
              {props.matchday ? ` · MD ${props.matchday}` : ""}
            </span>
            <span>Kickoff {fmtTime(props.kickoffAt, props.userTimeZone)}</span>
            <span>Closes {fmtTimeOnly(props.closeAt, props.userTimeZone)}</span>
          </div>
        </div>
        <StateBadge state={state} isNextOpen={isNextOpen} />
      </div>

      {/* Underdog tag */}
      {underdog && (
        <div
          style={{
            marginTop: 12,
            fontSize: 13,
            color: "var(--gold-300)",
            background: "rgba(243,201,105,0.1)",
            border: "1px solid rgba(243,201,105,0.4)",
            borderRadius: 8,
            padding: "7px 11px",
          }}
        >
          ⚡ Underdog: {flag(underdog)}
          {underdog.name} · back them to win for <strong>+5</strong>
        </div>
      )}

      {editable ? (
        /* ------------------------------ EDITABLE ------------------------------ */
        <div style={{ marginTop: 16 }}>
          {/* Scores */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>
                {flag(teamA)}
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
            <span className="display" style={{ fontSize: 20, color: "var(--chalk-dim)", paddingBottom: 8 }}>
              –
            </span>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>
                {flag(teamB)}
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

          {/* Scorer picks */}
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Goal scorers</h3>
              <span style={{ fontSize: 12, color: "var(--chalk-dim)" }}>
                {scorers.length}/{cap} (optional)
              </span>
            </div>
            <p style={{ color: "var(--chalk-dim)", fontSize: 12, margin: "4px 0 10px" }}>
              Name up to your total predicted goals. Each correct pick = +2 per goal they score.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {scorers.map((row) => (
                <div key={row.uid} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <select
                    value={row.playerId}
                    onChange={(e) => setScorerPlayer(row.uid, Number(e.target.value))}
                    style={selectStyle}
                  >
                    <option value={0}>— select scorer —</option>
                    {scorerGroups.map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeScorer(row.uid)}
                    aria-label="Remove scorer"
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
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addScorer}
              disabled={scorers.length >= cap}
              style={{
                marginTop: scorers.length > 0 ? 10 : 0,
                background: "transparent",
                border: "1px dashed var(--pitch-line)",
                color: "var(--chalk)",
                borderRadius: 9,
                padding: "8px 14px",
                cursor: scorers.length >= cap ? "default" : "pointer",
                opacity: scorers.length >= cap ? 0.45 : 1,
                fontSize: 13.5,
              }}
            >
              + Add scorer
            </button>
            {cap === 0 && (
              <p style={{ color: "var(--chalk-dim)", fontSize: 12, margin: "8px 0 0", opacity: 0.8 }}>
                Enter a score with at least one goal to name scorers.
              </p>
            )}
            {trimNote && (
              <p style={{ color: "var(--gold-300)", fontSize: 12.5, margin: "8px 0 0" }}>
                {trimNote}
              </p>
            )}
          </div>

          {/* 2x doubler — only on round-2 matches. Eligible (no underdog) shows
              the Yes/No toggle; round-2 WITH an underdog shows the note. */}
          {isRound2 &&
            (twoxEligible ? (
              <TwoXControl
                use2x={use2x}
                setUse2x={setUse2x}
                tokensUsed={tokensUsed}
                tokensMax={TOKENS_MAX}
              />
            ) : (
              <div
                style={{
                  marginTop: 18,
                  fontSize: 12.5,
                  color: "var(--chalk-dim)",
                  background: "var(--pitch-950)",
                  border: "1px solid var(--pitch-line)",
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                You cannot set 2x for matches where there is an underdog.
              </div>
            ))}

          {/* Actions */}
          <div
            style={{
              marginTop: 18,
              paddingTop: 16,
              borderTop: "1px solid var(--pitch-line)",
            }}
          >
            <p style={{ color: "var(--gold-300)", fontSize: 12.5, margin: "0 0 12px" }}>
              An unlocked prediction does <strong>not</strong> count — you must lock before kickoff.
            </p>

            {confirmingLock ? (
              <div
                style={{
                  background: "rgba(243,201,105,0.1)",
                  border: "1px solid rgba(243,201,105,0.45)",
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                <p style={{ margin: "0 0 12px", fontSize: 13.5, fontWeight: 600 }}>
                  {twoxEligible && use2x
                    ? "Lock this prediction with 2x ON — this uses one of your 3 doublers and can't be undone. Continue?"
                    : "You can't edit this after locking. Lock it in?"}
                </p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={doLock}
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
                  onClick={() => {
                    setMsg(null);
                    if (!validScores) {
                      setMsg({ ok: false, text: "Enter both scores first." });
                      return;
                    }
                    setConfirmingLock(true);
                  }}
                  disabled={pending}
                  style={{
                    background: "var(--gold-400)",
                    color: "#1a1206",
                    border: "none",
                    borderRadius: 9,
                    padding: "10px 18px",
                    fontWeight: 700,
                    cursor: pending ? "default" : "pointer",
                    opacity: pending ? 0.6 : 1,
                  }}
                >
                  Lock in Prediction
                </button>
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

          {/* Reveal hint while open */}
          <div
            style={{
              marginTop: 16,
              fontSize: 12.5,
              color: "var(--chalk-dim)",
            }}
          >
            🔒 Everyone&apos;s picks unlock once you lock yours (or after predictions close).
          </div>
        </div>
      ) : (
        /* ------------------------------ READ-ONLY ------------------------------ */
        <div style={{ marginTop: 16 }}>
          {myPrediction ? (
            <div
              style={{
                background: "var(--pitch-950)",
                border: "1px solid var(--pitch-line)",
                borderRadius: 10,
                padding: "12px 14px",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--chalk-dim)", marginBottom: 4 }}>
                Your prediction {myPrediction.locked ? "🔒" : ""}
              </div>
              <div className="display" style={{ fontSize: 18, fontWeight: 800 }}>
                {teamA.name} {myPrediction.scoreA}–{myPrediction.scoreB} {teamB.name}
              </div>
              <ScorerLine ids={myPrediction.scorerIds} playerName={playerName} />
              <TwoXIndicator
                used2x={myPrediction.used2x}
                show={myPrediction.used2x || twoxEligible}
              />
            </div>
          ) : state === "closed" ? (
            <div
              style={{
                fontSize: 13.5,
                color: "var(--m3)",
                fontWeight: 600,
                background: "rgba(239,71,111,0.08)",
                border: "1px solid rgba(239,71,111,0.35)",
                borderRadius: 10,
                padding: "12px 14px",
              }}
            >
              You didn&apos;t lock in time — you&apos;re out of this match (0 points).
            </div>
          ) : (
            <div style={{ fontSize: 13.5, color: "var(--chalk-dim)" }}>
              No prediction from you for this match.
            </div>
          )}

          {/* Locked / Closed → no result yet: the plain reveal list. */}
          <RevealSection reveal={reveal} playerName={playerName} teamA={teamA} teamB={teamB} />
          <p style={{ fontSize: 12, color: "var(--chalk-dim)", marginTop: 10, opacity: 0.85 }}>
            Results pending — points appear once the match is finished.
          </p>
        </div>
      )}
    </div>
  );
}

// Leading integer of a minute string ("45+2" → 45). Blank/unparseable sort last.
function parseMinute(m: string | null): number {
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = parseInt(m, 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

// Scorers line under the full-time score. Goals are grouped by the team they
// counted FOR: a normal goal → the scorer's team; an own goal → the opposing
// team (and marked "(OG)"). Within a team, ordered by minute.
function ScorersSummary({
  goals,
  teamA,
  teamB,
}: {
  goals: MatchGoalRow[];
  teamA: CardTeam;
  teamB: CardTeam;
}) {
  if (goals.length === 0) {
    return (
      <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--chalk-dim)" }}>
        No scorers recorded.
      </div>
    );
  }

  const forTeam = (teamId: number) =>
    goals
      .filter((g) => {
        const countsFor = g.isOwnGoal
          ? g.teamId === teamA.id
            ? teamB.id
            : teamA.id
          : g.teamId;
        return countsFor === teamId;
      })
      .sort((a, b) => parseMinute(a.minute) - parseMinute(b.minute));

  const render = (team: CardTeam) => {
    const list = forTeam(team.id);
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, color: "var(--chalk)" }}>
          {flag(team)}
          {team.name}
        </span>
        <span style={{ color: "var(--chalk-dim)" }}>
          {list.length === 0
            ? "—"
            : list
                .map(
                  (g) =>
                    `${g.playerName}${g.minute ? ` ${g.minute}'` : ""}${
                      g.isOwnGoal ? " (OG)" : ""
                    }`,
                )
                .join(", ")}
        </span>
      </div>
    );
  };

  return (
    <div
      className="tnum"
      style={{
        marginTop: 10,
        display: "flex",
        flexDirection: "column",
        gap: 5,
        fontSize: 12.5,
      }}
    >
      {render(teamA)}
      {render(teamB)}
    </div>
  );
}

function ScorerLine({
  ids,
  playerName,
}: {
  ids: number[];
  playerName: Map<number, string>;
}) {
  if (ids.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: "var(--chalk-dim)", marginTop: 4, opacity: 0.8 }}>
        No scorers backed.
      </div>
    );
  }
  return (
    <div style={{ fontSize: 12.5, color: "var(--chalk-dim)", marginTop: 4 }}>
      Scorers: {ids.map((id) => playerName.get(id) ?? `#${id}`).join(", ")}
    </div>
  );
}

function RevealSection({
  reveal,
  playerName,
  teamA,
  teamB,
}: {
  reveal: RevealRow[];
  playerName: Map<number, string>;
  teamA: CardTeam;
  teamB: CardTeam;
}) {
  // Sort: me first, then by name.
  const rows = [...reveal].sort((a, b) => {
    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 13.5, fontWeight: 700, margin: "0 0 10px" }}>
        Everyone&apos;s picks ({rows.length})
      </h3>
      {rows.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--chalk-dim)" }}>No predictions for this match.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => (
            <div
              key={r.userId}
              style={{
                background: r.isMe ? "rgba(31,164,99,0.12)" : "var(--pitch-950)",
                border: r.isMe ? "1px solid rgba(31,164,99,0.5)" : "1px solid var(--pitch-line)",
                borderRadius: 9,
                padding: "9px 12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {r.name}
                  {r.username ? (
                    <span style={{ color: "var(--chalk-dim)", fontWeight: 400 }}> ({r.username})</span>
                  ) : null}
                  {r.isMe ? <span style={{ color: "var(--pitch-500)" }}> · you</span> : null}
                  {r.used2x ? <TwoXTag /> : null}
                </span>
                <span className="display" style={{ fontSize: 14, fontWeight: 800 }}>
                  {teamA.code ?? teamA.name} {r.scoreA}–{r.scoreB} {teamB.code ?? teamB.name}
                </span>
              </div>
              {r.scorerIds.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--chalk-dim)", marginTop: 4 }}>
                  Scorers: {r.scorerIds.map((id) => playerName.get(id) ?? `#${id}`).join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STATE_BADGE: Record<MatchState, { label: string; bg: string; fg: string; border: string }> = {
  open: { label: "Open", bg: "rgba(31,164,99,0.14)", fg: "var(--pitch-500)", border: "var(--pitch-line)" },
  locked: { label: "Locked", bg: "rgba(243,201,105,0.16)", fg: "var(--gold-300)", border: "rgba(243,201,105,0.45)" },
  closed: { label: "Closed", bg: "rgba(159,179,166,0.12)", fg: "var(--chalk-dim)", border: "var(--pitch-line)" },
  finished: { label: "Finished", bg: "rgba(159,179,166,0.12)", fg: "var(--chalk-dim)", border: "var(--pitch-line)" },
};

// Open-state 2x toggle (eligible matches only). Yes/No, defaults to No. Shows
// the remaining-doubler tally and disables Yes once all 3 are spent.
function TwoXControl({
  use2x,
  setUse2x,
  tokensUsed,
  tokensMax,
}: {
  use2x: boolean;
  setUse2x: (v: boolean) => void;
  tokensUsed: number;
  tokensMax: number;
}) {
  const noneLeft = tokensUsed >= tokensMax;
  // If they've spent all doublers and this match isn't 2x'd, Yes is unavailable.
  const yesDisabled = noneLeft && !use2x;

  const optBtn = (selected: boolean, disabled: boolean): React.CSSProperties => ({
    flex: "0 0 auto",
    background: selected ? "var(--gold-400)" : "transparent",
    color: selected ? "#1a1206" : "var(--chalk)",
    border: `1px solid ${selected ? "var(--gold-400)" : "var(--pitch-line)"}`,
    borderRadius: 8,
    padding: "7px 18px",
    fontWeight: 700,
    fontSize: 13.5,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
  });

  return (
    <div
      style={{
        marginTop: 18,
        background: "rgba(243,201,105,0.07)",
        border: "1px solid rgba(243,201,105,0.4)",
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gold-300)" }}>
          ⚡ 2x your points this match?
        </span>
        <span style={{ fontSize: 12, color: "var(--chalk-dim)" }} className="tnum">
          2x used: {tokensUsed}/{tokensMax}
        </span>
      </div>
      <p style={{ color: "var(--chalk-dim)", fontSize: 12, margin: "4px 0 10px" }}>
        Doubles your total points for this match (negatives too). Locked in permanently — you only
        get {tokensMax} all tournament.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => setUse2x(false)} style={optBtn(!use2x, false)}>
          No
        </button>
        <button
          type="button"
          onClick={() => !yesDisabled && setUse2x(true)}
          disabled={yesDisabled}
          style={optBtn(use2x, yesDisabled)}
        >
          Yes
        </button>
        {yesDisabled && (
          <span style={{ fontSize: 12.5, color: "var(--m3)", fontWeight: 600 }}>No 2x left</span>
        )}
      </div>
    </div>
  );
}

// Static (read-only) 2x state shown on a locked/closed/finished prediction box.
function TwoXIndicator({ used2x, show }: { used2x: boolean; show: boolean }) {
  if (!show) return null;
  return (
    <div
      style={{
        marginTop: 8,
        fontSize: 12.5,
        fontWeight: 700,
        color: used2x ? "var(--gold-300)" : "var(--chalk-dim)",
      }}
    >
      {used2x ? "2x: ON ⚡" : "2x: OFF"}
    </div>
  );
}

// Small inline "⚡2x" marker beside a player who doubled down on this match.
function TwoXTag() {
  return (
    <span
      style={{
        marginLeft: 6,
        fontSize: 11,
        fontWeight: 800,
        color: "var(--gold-300)",
        background: "rgba(243,201,105,0.14)",
        border: "1px solid rgba(243,201,105,0.45)",
        borderRadius: 99,
        padding: "1px 7px",
        whiteSpace: "nowrap",
      }}
    >
      ⚡2x
    </span>
  );
}

function StateBadge({ state, isNextOpen }: { state: MatchState; isNextOpen: boolean }) {
  const s = STATE_BADGE[state];
  const label = state === "open" && isNextOpen ? "Next up" : s.label;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        padding: "3px 9px",
        borderRadius: 99,
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}
