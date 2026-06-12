import Link from "next/link";

export interface StandingRow {
  rank: number;
  userId: string;
  name: string;
  username: string;
  totalPts: number;
  isMe: boolean;
}

function Row({ r }: { r: StandingRow }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 10px",
        borderRadius: 8,
        background: r.isMe ? "rgba(31,164,99,0.12)" : "transparent",
        border: r.isMe ? "1px solid rgba(31,164,99,0.45)" : "1px solid transparent",
      }}
    >
      <span
        className="tnum"
        style={{ width: 22, textAlign: "right", color: "var(--chalk-dim)", fontWeight: 700, fontSize: 13 }}
      >
        {r.rank}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontWeight: 600 }}>{r.name}</span>
        {r.isMe && <span style={{ color: "var(--pitch-500)", fontWeight: 600 }}> · you</span>}
      </span>
      <span className="display tnum" style={{ color: "var(--gold-300)", fontWeight: 800, fontSize: 15 }}>
        {r.totalPts}
      </span>
    </div>
  );
}

function Body({ top, meBelow }: { top: StandingRow[]; meBelow: StandingRow | null }) {
  if (top.length === 0) {
    return <p style={{ fontSize: 13, color: "var(--chalk-dim)", margin: "4px 0 0" }}>No players yet.</p>;
  }
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {top.map((r) => (
          <Row key={r.userId} r={r} />
        ))}
        {meBelow && (
          <>
            <div style={{ textAlign: "center", color: "var(--chalk-dim)", fontSize: 12, padding: "2px 0" }}>
              ⋯
            </div>
            <Row r={meBelow} />
          </>
        )}
      </div>
      <Link
        href="/leaderboard"
        style={{
          display: "inline-block",
          marginTop: 10,
          fontSize: 12.5,
          color: "var(--gold-300)",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Full leaderboard →
      </Link>
    </>
  );
}

// Condensed standings — top players + the current user's rank if they're below
// the cut. Rendered twice on the predictions page: a sticky desktop aside
// (variant "aside") and a collapsible mobile section (variant "mobile"). The
// .standings-aside / .standings-mobile classes toggle visibility per breakpoint.
export default function StandingsPanel({
  top,
  meBelow,
  variant,
}: {
  top: StandingRow[];
  meBelow: StandingRow | null;
  variant: "aside" | "mobile";
}) {
  if (variant === "mobile") {
    return (
      <details className="rules-banner standings-mobile">
        <summary
          style={{
            cursor: "pointer",
            fontWeight: 800,
            fontSize: 15,
            color: "var(--chalk)",
            listStyle: "none",
          }}
          className="display"
        >
          Standings
        </summary>
        <div style={{ marginTop: 12 }}>
          <Body top={top} meBelow={meBelow} />
        </div>
      </details>
    );
  }

  return (
    <aside
      className="standings-aside"
      style={{
        background: "var(--pitch-900)",
        border: "1px solid var(--pitch-line)",
        borderRadius: 14,
        padding: 14,
      }}
    >
      <h2 className="display" style={{ fontSize: 16, fontWeight: 800, margin: "0 0 10px" }}>
        Standings
      </h2>
      <Body top={top} meBelow={meBelow} />
    </aside>
  );
}
