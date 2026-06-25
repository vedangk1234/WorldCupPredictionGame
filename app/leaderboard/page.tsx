import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import { requireUser } from "@/lib/auth";
import type { LeaderboardRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// Total leaderboard: ranked by cumulative points. The category columns are
// *counts* (bragging tallies) and deliberately do NOT sum to the points total
// (different units — see CLAUDE.md §2.5).
export default async function LeaderboardPage() {
  const { user, supabase } = await requireUser();

  const { data, error } = await supabase.from("leaderboard").select("*");
  const rows = (data ?? []) as LeaderboardRow[];

  // Highest points first; username asc for a stable order on ties.
  rows.sort(
    (a, b) => b.total_pts - a.total_pts || a.username.localeCompare(b.username),
  );

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 880, margin: "0 auto", padding: "32px 20px 80px" }}>
        <Link
          href="/"
          style={{
            display: "inline-block",
            color: "var(--chalk-dim)",
            textDecoration: "none",
            fontSize: 13.5,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          ← Home
        </Link>
        <div className="stripe-26" style={{ borderRadius: 99, marginBottom: 18, maxWidth: 120 }} />
        <p
          style={{
            color: "var(--gold-400)",
            letterSpacing: "0.18em",
            fontSize: 12,
            fontWeight: 700,
            margin: 0,
          }}
        >
          FIFA WORLD CUP 2026 · GROUP STAGE
        </p>
        <h1 className="display" style={{ fontSize: 40, lineHeight: 1.05, margin: "8px 0 12px" }}>
          Leaderboard
        </h1>
        <p style={{ color: "var(--chalk-dim)", fontSize: 14, lineHeight: 1.6, margin: "0 0 24px", maxWidth: 620 }}>
          Ranked by total points. The columns are tallies (how many you&apos;ve got right) — they
          don&apos;t add up to the points total.
        </p>

        {error && (
          <p style={{ color: "var(--m3)" }}>Failed to load leaderboard: {error.message}</p>
        )}

        {!error && rows.length === 0 && (
          <p style={{ color: "var(--chalk-dim)", fontSize: 15 }}>
            No players yet. The board fills in as people sign up.
          </p>
        )}

        {!error && rows.length > 0 && (
          <div className="lb-scroll" style={{ border: "1px solid var(--pitch-line)", borderRadius: 14 }}>
            <table className="lb-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Exact</th>
                  <th>Winner</th>
                  <th>GD</th>
                  <th>Scorers</th>
                  <th>Underdog</th>
                  <th>2x used</th>
                  <th>Sets Won</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isMe = r.user_id === user.id;
                  return (
                    <tr
                      key={r.user_id}
                      style={{
                        background: isMe ? "rgba(31,164,99,0.12)" : "transparent",
                      }}
                    >
                      <td className="tnum" style={{ color: "var(--chalk-dim)", fontWeight: 700 }}>
                        {i + 1}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{r.name}</span>
                        <span style={{ color: "var(--chalk-dim)", fontWeight: 400 }}>
                          {" "}
                          ({r.username})
                        </span>
                        {isMe && <span style={{ color: "var(--pitch-500)", fontWeight: 600 }}> · you</span>}
                      </td>
                      <td className="tnum">{r.exact_count}</td>
                      <td className="tnum">{r.winners_count}</td>
                      <td className="tnum">{r.gd_count}</td>
                      <td className="tnum">{r.scorers_count}</td>
                      <td className="tnum">{r.underdog_count}</td>
                      <td className="tnum">{r.twox_used ?? 0}</td>
                      <td className="tnum">{r.sets_won ?? 0}</td>
                      <td
                        className="display tnum"
                        style={{ color: "var(--gold-300)", fontWeight: 800, fontSize: 17 }}
                      >
                        {r.total_pts}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
