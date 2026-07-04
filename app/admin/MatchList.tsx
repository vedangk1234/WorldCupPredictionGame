import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { fmtIST, fmtISTTime } from "@/lib/format";
import { isKnockout } from "@/lib/scoring";
import type { Stage } from "@/lib/types";

// Shared admin match list, rendered by /admin (ro32) and /admin/group-stage
// (group). Lists every match of the given `stage`, soonest first, each linking
// to its result-entry page. Both routes call requireAdmin first and all times
// stay in IST.

interface JoinedTeam {
  id: number;
  name: string;
  code: string | null;
  flag_url: string | null;
}
interface AdminMatchRow {
  id: number;
  group_letter: string | null;
  matchday: number | null;
  kickoff_at: string;
  predictions_close_at: string;
  underdog_team_id: number | null;
  score_a: number | null;
  score_b: number | null;
  finished: boolean;
  team_a: JoinedTeam | null;
  team_b: JoinedTeam | null;
  underdog: JoinedTeam | null;
}

type MatchUiState = "open" | "locked" | "finished";

function matchState(m: AdminMatchRow, now: number): MatchUiState {
  if (m.finished) return "finished";
  if (new Date(m.predictions_close_at).getTime() <= now) return "locked";
  return "open";
}

function TeamName({ team }: { team: JoinedTeam | null }) {
  if (!team) return <span style={{ color: "var(--chalk-dim)" }}>?</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {team.flag_url ? (
        <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
          {team.flag_url}
        </span>
      ) : null}
      <span style={{ fontWeight: 600 }}>{team.name}</span>
    </span>
  );
}

const STATE_STYLE: Record<MatchUiState, { label: string; bg: string; fg: string; border: string }> = {
  open: { label: "Open", bg: "rgba(31,164,99,0.14)", fg: "var(--pitch-500)", border: "var(--pitch-line)" },
  locked: { label: "Locked · awaiting result", bg: "rgba(243,201,105,0.16)", fg: "var(--gold-300)", border: "rgba(243,201,105,0.45)" },
  finished: { label: "Finished", bg: "rgba(159,179,166,0.12)", fg: "var(--chalk-dim)", border: "var(--pitch-line)" },
};

function StateBadge({ state }: { state: MatchUiState }) {
  const s = STATE_STYLE[state];
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
      }}
    >
      {s.label}
    </span>
  );
}

interface NavLink {
  href: string;
  label: string;
}

export default async function AdminMatchList({
  stage,
  eyebrow,
  title,
  navLinks,
}: {
  stage: Stage;
  eyebrow: string;
  title: string;
  navLinks: NavLink[];
}) {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from("matches")
    .select(
      `id, group_letter, matchday, kickoff_at, predictions_close_at,
       underdog_team_id, score_a, score_b, finished,
       team_a:teams!matches_team_a_id_fkey(id, name, code, flag_url),
       team_b:teams!matches_team_b_id_fkey(id, name, code, flag_url),
       underdog:teams!matches_underdog_team_id_fkey(id, name, code, flag_url)`,
    )
    .eq("stage", stage)
    .order("kickoff_at", { ascending: true });

  const matches = (data ?? []) as unknown as AdminMatchRow[];
  const now = Date.now();
  const knockout = isKnockout(stage);
  // Per-match round label for a knockout row's metadata line.
  const roundLabel = stage === "ro16" ? "Round of 16" : "Round of 32";

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "40px 24px 80px" }}>
      <div className="stripe-26" style={{ borderRadius: 99, marginBottom: 22 }} />
      <p
        style={{
          color: "var(--gold-400)",
          letterSpacing: "0.18em",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {eyebrow}
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          margin: "8px 0 14px",
        }}
      >
        <h1 className="display" style={{ fontSize: 40, lineHeight: 1.05, margin: 0 }}>
          {title}
        </h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              style={{
                color: "var(--gold-300)",
                fontWeight: 700,
                fontSize: 14,
                textDecoration: "none",
                border: "1px solid var(--pitch-line)",
                borderRadius: 99,
                padding: "7px 14px",
              }}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          color: "var(--chalk-dim)",
          fontSize: 13,
          marginBottom: 28,
        }}
      >
        <StateBadge state="open" />
        <span>predictions still open</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <StateBadge state="locked" />
        <span>played / closed — enter the result</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <StateBadge state="finished" />
        <span>result in, points computed</span>
      </div>

      {error && (
        <p style={{ color: "var(--m3)" }}>Failed to load matches: {error.message}</p>
      )}
      {!error && matches.length === 0 && (
        <p style={{ color: "var(--chalk-dim)" }}>
          No {knockout ? "knockout" : "group-stage"} matches found.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {matches.map((m) => {
          const state = matchState(m, now);
          const dim = state === "finished";
          return (
            <Link
              key={m.id}
              href={`/admin/match/${m.id}`}
              style={{
                display: "block",
                textDecoration: "none",
                color: "inherit",
                background: "var(--pitch-900)",
                border:
                  state === "locked"
                    ? "1px solid rgba(243,201,105,0.45)"
                    : "1px solid var(--pitch-line)",
                borderRadius: 12,
                padding: "14px 16px",
                opacity: dim ? 0.6 : 1,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <TeamName team={m.team_a} />
                  <span style={{ color: "var(--chalk-dim)", fontSize: 13 }}>vs</span>
                  <TeamName team={m.team_b} />
                  {m.finished && m.score_a !== null && m.score_b !== null && (
                    <span
                      className="display"
                      style={{
                        marginLeft: 4,
                        fontSize: 15,
                        color: "var(--gold-300)",
                        fontWeight: 800,
                      }}
                    >
                      {m.score_a}–{m.score_b}
                    </span>
                  )}
                </div>
                <StateBadge state={state} />
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "4px 14px",
                  marginTop: 8,
                  fontSize: 12.5,
                  color: "var(--chalk-dim)",
                }}
              >
                <span>
                  {knockout
                    ? roundLabel
                    : `Group ${m.group_letter ?? "—"}${m.matchday ? ` · MD ${m.matchday}` : ""}`}
                </span>
                <span>Kickoff {fmtIST(m.kickoff_at)}</span>
                <span>Closes {fmtISTTime(m.predictions_close_at)}</span>
              </div>

              <div style={{ marginTop: 6, fontSize: 12.5 }}>
                {m.underdog ? (
                  <span style={{ color: "var(--gold-300)" }}>
                    ⚡ Underdog: {m.underdog.name}
                  </span>
                ) : (
                  <span style={{ color: "var(--chalk-dim)", opacity: 0.7 }}>
                    no underdog set
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
