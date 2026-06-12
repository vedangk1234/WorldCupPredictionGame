import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { fmtIST, fmtISTTime } from "@/lib/format";
import type { GoalEntry } from "@/lib/types";
import UnderdogControl from "./UnderdogControl";
import ResultForm from "./ResultForm";

export const dynamic = "force-dynamic";

interface JoinedTeam {
  id: number;
  name: string;
  code: string | null;
  flag_url: string | null;
}
interface MatchDetail {
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
}

export default async function MatchDetailPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();
  const matchId = Number(params.id);
  if (!Number.isInteger(matchId)) notFound();

  const { data: matchData } = await supabase
    .from("matches")
    .select(
      `id, group_letter, matchday, kickoff_at, predictions_close_at,
       underdog_team_id, score_a, score_b, finished,
       team_a:teams!matches_team_a_id_fkey(id, name, code, flag_url),
       team_b:teams!matches_team_b_id_fkey(id, name, code, flag_url)`,
    )
    .eq("id", matchId)
    .single();

  const match = matchData as unknown as MatchDetail | null;
  if (!match || !match.team_a || !match.team_b) notFound();

  const teamA = match.team_a;
  const teamB = match.team_b;

  // Squads for both teams, ordered by team then shirt number.
  const { data: playersData } = await supabase
    .from("players")
    .select("id, name, position, shirt_number, team_id")
    .in("team_id", [teamA.id, teamB.id])
    .order("team_id", { ascending: true })
    .order("shirt_number", { ascending: true, nullsFirst: false });
  const players = (playersData ?? []) as {
    id: number;
    name: string;
    position: string | null;
    shirt_number: number | null;
    team_id: number;
  }[];

  // Current goals — one row per goal, each with its stored minute and own-goal flag.
  const { data: goalsData } = await supabase
    .from("match_goals")
    .select("player_id, minute, is_own_goal")
    .eq("match_id", matchId)
    .order("id", { ascending: true });
  const initialGoals: GoalEntry[] = (goalsData ?? []).map((g) => ({
    player_id: g.player_id as number,
    minute: (g.minute as string | null) ?? "",
    is_own_goal: g.is_own_goal as boolean,
  }));

  const closed = new Date(match.predictions_close_at).getTime() <= Date.now();
  const stateLabel = match.finished
    ? "Finished"
    : closed
      ? "Locked · awaiting result"
      : "Open";

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px 80px" }}>
      <div className="stripe-26" style={{ borderRadius: 99, marginBottom: 18 }} />

      <Link
        href="/admin"
        style={{ color: "var(--chalk-dim)", fontSize: 13, textDecoration: "none" }}
      >
        ← All matches
      </Link>

      <div style={{ margin: "14px 0 6px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 className="display" style={{ fontSize: 30, lineHeight: 1.1, margin: 0 }}>
          {teamA.flag_url ? <span aria-hidden>{teamA.flag_url} </span> : null}
          {teamA.name} <span style={{ color: "var(--chalk-dim)", fontSize: 20 }}>vs</span>{" "}
          {teamB.flag_url ? <span aria-hidden>{teamB.flag_url} </span> : null}
          {teamB.name}
        </h1>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--gold-300)",
            border: "1px solid var(--pitch-line)",
            borderRadius: 99,
            padding: "3px 10px",
          }}
        >
          {stateLabel}
        </span>
      </div>

      <div style={{ color: "var(--chalk-dim)", fontSize: 13, marginBottom: 24, display: "flex", gap: "4px 14px", flexWrap: "wrap" }}>
        <span>
          Group {match.group_letter ?? "—"}
          {match.matchday ? ` · MD ${match.matchday}` : ""}
        </span>
        <span>Kickoff {fmtIST(match.kickoff_at)}</span>
        <span>Closes {fmtISTTime(match.predictions_close_at)}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <UnderdogControl
          matchId={matchId}
          teamA={{ id: teamA.id, name: teamA.name }}
          teamB={{ id: teamB.id, name: teamB.name }}
          initialUnderdogId={match.underdog_team_id}
        />

        <ResultForm
          matchId={matchId}
          teamA={{ id: teamA.id, name: teamA.name, flag: teamA.flag_url }}
          teamB={{ id: teamB.id, name: teamB.name, flag: teamB.flag_url }}
          players={players}
          initialScoreA={match.score_a}
          initialScoreB={match.score_b}
          initialGoals={initialGoals}
          finished={match.finished}
        />
      </div>
    </main>
  );
}
