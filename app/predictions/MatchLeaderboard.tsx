"use client";

import { useMemo, useState } from "react";
import type { CardTeam, CardPlayer, RevealRow, MatchPointsRow } from "./MatchCard";

function flag(f: string | null): string {
  return f ? `${f} ` : "";
}

const cell: React.CSSProperties = {
  padding: "8px 8px",
  textAlign: "right",
  whiteSpace: "nowrap",
  fontSize: 13,
};

// Per-finished-match leaderboard: a POINTS breakdown (winner/gd/exact/scorers/
// underdog → match total) that DOES sum to the total. Each row expands to show
// that player's predicted scoreline + the scorers they backed (CLAUDE.md §2.5).
export default function MatchLeaderboard({
  teamA,
  teamB,
  squadA,
  squadB,
  points,
  reveal,
  currentUserId,
}: {
  teamA: CardTeam;
  teamB: CardTeam;
  squadA: CardPlayer[];
  squadB: CardPlayer[];
  points: MatchPointsRow[];
  reveal: RevealRow[];
  currentUserId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // player id → { name, flag } using each squad's team flag.
  const playerInfo = useMemo(() => {
    const map = new Map<number, { name: string; flag: string | null }>();
    for (const p of squadA) map.set(p.id, { name: p.name, flag: teamA.flag_url });
    for (const p of squadB) map.set(p.id, { name: p.name, flag: teamB.flag_url });
    return map;
  }, [squadA, squadB, teamA.flag_url, teamB.flag_url]);

  const revealByUser = useMemo(() => {
    const map = new Map<string, RevealRow>();
    for (const r of reveal) map.set(r.userId, r);
    return map;
  }, [reveal]);

  const rows = useMemo(
    () =>
      [...points].sort(
        (a, b) => b.totalPts - a.totalPts || a.username.localeCompare(b.username),
      ),
    [points],
  );

  return (
    <div style={{ marginTop: 16 }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          background: "transparent",
          border: "1px solid var(--pitch-line)",
          color: "var(--chalk)",
          borderRadius: 9,
          padding: "8px 14px",
          fontSize: 13.5,
          fontWeight: 700,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ color: "var(--gold-300)" }}>{expanded ? "▾" : "▸"}</span>
        View match leaderboard
      </button>

      {!expanded ? null : rows.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--chalk-dim)", margin: "12px 0 0" }}>
          No locked predictions for this match.
        </p>
      ) : (
        <div style={{ marginTop: 12 }}>
          <MatchLeaderboardTable
            rows={rows}
            openId={openId}
            setOpenId={setOpenId}
            currentUserId={currentUserId}
            revealByUser={revealByUser}
            teamA={teamA}
            teamB={teamB}
            playerInfo={playerInfo}
          />
        </div>
      )}
    </div>
  );
}

function MatchLeaderboardTable({
  rows,
  openId,
  setOpenId,
  currentUserId,
  revealByUser,
  teamA,
  teamB,
  playerInfo,
}: {
  rows: MatchPointsRow[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  currentUserId: string;
  revealByUser: Map<string, RevealRow>;
  teamA: CardTeam;
  teamB: CardTeam;
  playerInfo: Map<number, { name: string; flag: string | null }>;
}) {
  return (
    <>
      {rows.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--chalk-dim)", margin: 0 }}>
          No locked predictions for this match.
        </p>
      ) : (
        <div
          style={{
            border: "1px solid var(--pitch-line)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", minWidth: 540, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--chalk-dim)" }}>
                  <th style={{ ...cell, textAlign: "left", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    Player
                  </th>
                  <th style={{ ...cell, fontSize: 11 }}>Win</th>
                  <th style={{ ...cell, fontSize: 11 }}>GD</th>
                  <th style={{ ...cell, fontSize: 11 }}>Exact</th>
                  <th style={{ ...cell, fontSize: 11 }}>Scor</th>
                  <th style={{ ...cell, fontSize: 11 }}>Udog</th>
                  <th style={{ ...cell, fontSize: 11 }}>2x</th>
                  <th style={{ ...cell, fontSize: 11 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isMe = r.userId === currentUserId;
                  const isOpen = openId === r.userId;
                  const pred = revealByUser.get(r.userId);
                  return (
                    <RowGroup
                      key={r.userId}
                      r={r}
                      isMe={isMe}
                      isOpen={isOpen}
                      onToggle={() => setOpenId(isOpen ? null : r.userId)}
                      pred={pred}
                      teamA={teamA}
                      teamB={teamB}
                      playerInfo={playerInfo}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function RowGroup({
  r,
  isMe,
  isOpen,
  onToggle,
  pred,
  teamA,
  teamB,
  playerInfo,
}: {
  r: MatchPointsRow;
  isMe: boolean;
  isOpen: boolean;
  onToggle: () => void;
  pred: RevealRow | undefined;
  teamA: CardTeam;
  teamB: CardTeam;
  playerInfo: Map<number, { name: string; flag: string | null }>;
}) {
  const rowBg = isMe ? "rgba(31,164,99,0.12)" : "transparent";
  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          background: rowBg,
          cursor: "pointer",
          borderTop: "1px solid var(--pitch-line)",
        }}
      >
        <td style={{ ...cell, textAlign: "left" }}>
          <span style={{ color: "var(--chalk-dim)", marginRight: 6 }}>{isOpen ? "▾" : "▸"}</span>
          <span style={{ fontWeight: 600 }}>{r.name}</span>
          <span style={{ color: "var(--chalk-dim)", fontWeight: 400 }}> ({r.username})</span>
          {isMe && <span style={{ color: "var(--pitch-500)", fontWeight: 600 }}> · you</span>}
        </td>
        <td className="tnum" style={cell}>{r.winnerPts}</td>
        <td className="tnum" style={cell}>{r.gdPts}</td>
        <td className="tnum" style={cell}>{r.exactPts}</td>
        <td className="tnum" style={cell}>{r.scorerPts}</td>
        <td className="tnum" style={cell}>{r.underdogPts}</td>
        <td
          style={{
            ...cell,
            fontWeight: 700,
            color: r.used2x ? "var(--gold-300)" : "var(--chalk-dim)",
          }}
        >
          {r.used2x ? "Yes ⚡" : "No"}
        </td>
        <td
          className="display tnum"
          style={{ ...cell, color: "var(--gold-300)", fontWeight: 800, fontSize: 15 }}
        >
          {r.totalPts}
        </td>
      </tr>
      {isOpen && (
        <tr style={{ background: rowBg }}>
          <td colSpan={8} style={{ padding: "0 10px 12px" }}>
            <div
              style={{
                background: "var(--pitch-950)",
                border: "1px solid var(--pitch-line)",
                borderRadius: 9,
                padding: "10px 12px",
              }}
            >
              {pred ? (
                <>
                  <div className="display tnum" style={{ fontSize: 15, fontWeight: 800 }}>
                    {teamA.flag_url ? `${teamA.flag_url} ` : ""}
                    {teamA.name} {pred.scoreA}–{pred.scoreB} {teamB.name}
                    {teamB.flag_url ? ` ${teamB.flag_url}` : ""}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--chalk-dim)", marginTop: 5 }}>
                    {pred.scorerIds.length > 0
                      ? pred.scorerIds
                          .map((id) => {
                            const info = playerInfo.get(id);
                            return info ? `${info.flag ? `${info.flag} ` : ""}${info.name}` : `#${id}`;
                          })
                          .join(", ")
                      : "No scorers picked."}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12.5, color: "var(--chalk-dim)" }}>
                  Prediction unavailable.
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
