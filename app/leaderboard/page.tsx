import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import { requireUser } from "@/lib/auth";
import type { LeaderboardRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// One row per user from the public.outrights_leaderboard view. Unlike the main
// board, every column here is POINTS (they add up to the total).
type OutrightsRow = {
  user_id: string;
  name: string;
  username: string;
  champion_pts: number;
  runner_up_pts: number;
  third_place_pts: number;
  golden_boot_pts: number;
  golden_ball_pts: number;
  golden_glove_pts: number;
  boot_goals_pts: number;
  total_pts: number;
};

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

  // Outrights board (~20 rows, well under the PostgREST cap — single select).
  const { data: outrightsData, error: outrightsError } = await supabase
    .from("outrights_leaderboard")
    .select("*");
  const outrightsRows = (outrightsData ?? []) as OutrightsRow[];
  outrightsRows.sort(
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

        {/* ── Outrights leaderboard ─────────────────────────────────────────
            OPPOSITE of the main board: every column here is POINTS and they
            DO sum to the Total. */}
        <h2 className="display" style={{ fontSize: 30, lineHeight: 1.05, margin: "48px 0 8px" }}>
          Outrights Leaderboard
        </h2>
        <p style={{ color: "var(--chalk-dim)", fontSize: 13.5, lineHeight: 1.6, margin: "0 0 14px" }}>
          🏆 Spain · 🥈 Argentina · 🥉 England · Boot: Mbappé (10) · Ball: Rodri · Glove: Unai Simón
        </p>

        {outrightsError && (
          <p style={{ color: "var(--m3)" }}>
            Failed to load outrights leaderboard: {outrightsError.message}
          </p>
        )}

        {!outrightsError && outrightsRows.length === 0 && (
          <p style={{ color: "var(--chalk-dim)", fontSize: 15 }}>
            Outright results aren&apos;t in yet.
          </p>
        )}

        {!outrightsError && outrightsRows.length > 0 && (
          <>
            <div className="lb-scroll" style={{ border: "1px solid var(--pitch-line)", borderRadius: 14 }}>
              <table className="lb-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Player</th>
                    <th>Champ</th>
                    <th>R-up</th>
                    <th>3rd</th>
                    <th>Boot</th>
                    <th>Ball</th>
                    <th>Glove</th>
                    <th>Goals</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {outrightsRows.map((r, i) => {
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
                        <td className="tnum">{r.champion_pts}</td>
                        <td className="tnum">{r.runner_up_pts}</td>
                        <td className="tnum">{r.third_place_pts}</td>
                        <td className="tnum">{r.golden_boot_pts}</td>
                        <td className="tnum">{r.golden_ball_pts}</td>
                        <td className="tnum">{r.golden_glove_pts}</td>
                        <td className="tnum">{r.boot_goals_pts}</td>
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
            <p style={{ color: "var(--chalk-dim)", fontSize: 12.5, lineHeight: 1.6, margin: "10px 0 0" }}>
              Champ = Champion · R-up = Runner-up · 3rd = Third place · Boot = Golden Boot · Ball =
              Golden Ball · Glove = Golden Glove · Goals = Boot goals (exact)
            </p>
            <p style={{ color: "var(--chalk-dim)", fontSize: 13, lineHeight: 1.6, margin: "8px 0 0" }}>
              Every column here is points scored — unlike the main board, these add up to the Total.
            </p>
          </>
        )}
      </main>
    </>
  );
}
