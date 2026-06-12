import SiteHeader from "@/app/components/SiteHeader";
import { requireUser } from "@/lib/auth";
import type { LeaderboardRow } from "@/lib/types";
import MatchCard from "./MatchCard";
import type { MatchState, CardPlayer, CardPrediction, RevealRow, MatchPointsRow } from "./MatchCard";
import StandingsPanel from "./StandingsPanel";
import type { StandingRow } from "./StandingsPanel";

export const dynamic = "force-dynamic";

interface JoinedTeam {
  id: number;
  name: string;
  code: string | null;
  flag_url: string | null;
}
interface MatchRow {
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

interface PredRow {
  id: number;
  user_id: string;
  match_id: number;
  score_a: number;
  score_b: number;
  locked: boolean;
  prediction_scorers: { player_id: number }[] | null;
}

interface PointsRow {
  user_id: string;
  match_id: number;
  winner_pts: number;
  gd_pts: number;
  exact_pts: number;
  scorer_pts: number;
  underdog_pts: number;
  total_pts: number;
}

function matchState(
  m: MatchRow,
  now: number,
  myLocked: boolean,
): MatchState {
  if (m.finished) return "finished";
  if (new Date(m.predictions_close_at).getTime() <= now) return "closed";
  if (myLocked) return "locked";
  return "open";
}

export default async function PredictionsPage() {
  const { user, supabase } = await requireUser();

  // All matches, soonest first, with both teams + underdog joined.
  const { data: matchesData, error: matchErr } = await supabase
    .from("matches")
    .select(
      `id, group_letter, matchday, kickoff_at, predictions_close_at,
       underdog_team_id, score_a, score_b, finished,
       team_a:teams!matches_team_a_id_fkey(id, name, code, flag_url),
       team_b:teams!matches_team_b_id_fkey(id, name, code, flag_url),
       underdog:teams!matches_underdog_team_id_fkey(id, name, code, flag_url)`,
    )
    .order("kickoff_at", { ascending: true });
  const matches = (matchesData ?? []) as unknown as MatchRow[];

  // The current user's own predictions (+ backed scorers) across all matches.
  const { data: myPredsData } = await supabase
    .from("predictions")
    .select("id, user_id, match_id, score_a, score_b, locked, prediction_scorers(player_id)")
    .eq("user_id", user.id);
  const myPreds = (myPredsData ?? []) as unknown as PredRow[];
  const myPredByMatch = new Map<number, PredRow>();
  for (const p of myPreds) myPredByMatch.set(p.match_id, p);

  // Every player (id → squad info) for the scorer dropdowns and name lookups.
  // Picks are always from the two squads, so this covers every referenced id.
  const { data: playersData } = await supabase
    .from("players")
    .select("id, name, position, shirt_number, team_id");
  const players = (playersData ?? []) as CardPlayer[];
  const squadByTeam = new Map<number, CardPlayer[]>();
  for (const p of players) {
    const list = squadByTeam.get(p.team_id) ?? [];
    list.push(p);
    squadByTeam.set(p.team_id, list);
  }

  const now = Date.now();

  // Which matches are revealed to this user? RLS allows reading everyone's
  // predictions only when revealed (close passed OR I've locked mine).
  const revealedIds = matches
    .filter((m) => {
      const mine = myPredByMatch.get(m.id);
      const state = matchState(m, now, mine?.locked ?? false);
      return state !== "open";
    })
    .map((m) => m.id);

  // Pull all predictions for revealed matches in one query (RLS-gated), plus the
  // predictor profiles. For non-revealed matches the query would only return our
  // own row, so we skip them entirely.
  let revealRows: PredRow[] = [];
  const profileById = new Map<string, { name: string; username: string }>();
  if (revealedIds.length > 0) {
    const { data: allPredsData } = await supabase
      .from("predictions")
      .select("id, user_id, match_id, score_a, score_b, locked, prediction_scorers(player_id)")
      .in("match_id", revealedIds);
    revealRows = (allPredsData ?? []) as unknown as PredRow[];

    const userIds = Array.from(new Set(revealRows.map((r) => r.user_id)));
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name, username")
        .in("id", userIds);
      for (const pr of profs ?? []) {
        profileById.set(pr.id as string, {
          name: pr.name as string,
          username: pr.username as string,
        });
      }
    }
  }
  const revealByMatch = new Map<number, PredRow[]>();
  for (const r of revealRows) {
    const list = revealByMatch.get(r.match_id) ?? [];
    list.push(r);
    revealByMatch.set(r.match_id, list);
  }

  // Points breakdown for finished matches (one query, RLS allows all to read).
  // Rows exist only for finished matches and only for locked predictions.
  const finishedIds = matches.filter((m) => m.finished).map((m) => m.id);
  const pointsByMatch = new Map<number, MatchPointsRow[]>();
  if (finishedIds.length > 0) {
    const { data: pts } = await supabase
      .from("prediction_points")
      .select("user_id, match_id, winner_pts, gd_pts, exact_pts, scorer_pts, underdog_pts, total_pts")
      .in("match_id", finishedIds);
    for (const row of (pts ?? []) as PointsRow[]) {
      const prof = profileById.get(row.user_id);
      const list = pointsByMatch.get(row.match_id) ?? [];
      list.push({
        userId: row.user_id,
        name: prof?.name ?? "Player",
        username: prof?.username ?? "",
        winnerPts: row.winner_pts,
        gdPts: row.gd_pts,
        exactPts: row.exact_pts,
        scorerPts: row.scorer_pts,
        underdogPts: row.underdog_pts,
        totalPts: row.total_pts,
      });
      pointsByMatch.set(row.match_id, list);
    }
  }

  // Condensed standings (reuse the leaderboard view): top 8 + my own rank.
  const { data: lbData } = await supabase.from("leaderboard").select("*");
  const lb = (lbData ?? []) as LeaderboardRow[];
  lb.sort((a, b) => b.total_pts - a.total_pts || a.username.localeCompare(b.username));
  const standings: StandingRow[] = lb.map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    name: r.name,
    username: r.username,
    totalPts: r.total_pts,
    isMe: r.user_id === user.id,
  }));
  const topStandings = standings.slice(0, 8);
  const meStanding = standings.find((s) => s.isMe) ?? null;
  const meBelow = meStanding && meStanding.rank > 8 ? meStanding : null;

  // Find the soonest still-open match so we can highlight it as "next up".
  const nextOpenId = matches.find((m) => {
    const mine = myPredByMatch.get(m.id);
    return matchState(m, now, mine?.locked ?? false) === "open";
  })?.id;

  return (
    <>
      <SiteHeader />
      <main className="preds-layout">
        <div className="preds-main">
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
        <h1 className="display" style={{ fontSize: 38, lineHeight: 1.05, margin: "8px 0 16px" }}>
          Make Predictions
        </h1>

        {/* How scoring works — collapses on small screens via <details>. */}
        <details className="rules-banner" open>
          <summary
            style={{
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 14,
              color: "var(--chalk)",
              listStyle: "none",
            }}
          >
            ⚽ How scoring works
          </summary>
          <ul
            style={{
              margin: "10px 0 0",
              padding: "0 0 0 2px",
              listStyle: "none",
              color: "var(--chalk-dim)",
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            <li>
              <strong style={{ color: "var(--gold-300)" }}>Exact score 9</strong> · correct
              winner <strong>+3</strong> · correct winning margin <strong>+1</strong>
            </li>
            <li>
              <strong style={{ color: "var(--gold-300)" }}>Exact draw 6</strong> · right that
              it&apos;s a draw but wrong score <strong>+1</strong>
            </li>
            <li>
              Each correctly-named scorer <strong>+2 per goal</strong> they score (a brace = +4);{" "}
              <strong>−1</strong> if a player you backed scores an own goal
            </li>
            <li>
              Designated <strong>⚡ underdog</strong> actually wins and you backed them:{" "}
              <strong>+5</strong>
            </li>
            <li style={{ color: "var(--gold-300)" }}>
              You <strong>must lock</strong> your prediction before kickoff — an unlocked
              prediction does not count (0 points for that match).
            </li>
          </ul>
        </details>

        {/* Mobile: collapsible standings near the top (hidden on desktop). */}
        <div style={{ marginTop: 18 }}>
          <StandingsPanel variant="mobile" top={topStandings} meBelow={meBelow} />
        </div>

        {matchErr && (
          <p style={{ color: "var(--m3)", marginTop: 20 }}>
            Failed to load matches: {matchErr.message}
          </p>
        )}
        {!matchErr && matches.length === 0 && (
          <p style={{ color: "var(--chalk-dim)", marginTop: 20 }}>
            No matches yet. Check back once fixtures are loaded.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 24 }}>
          {matches.map((m) => {
            if (!m.team_a || !m.team_b) return null;
            const mine = myPredByMatch.get(m.id);
            const state = matchState(m, now, mine?.locked ?? false);

            const myPrediction: CardPrediction | null = mine
              ? {
                  scoreA: mine.score_a,
                  scoreB: mine.score_b,
                  locked: mine.locked,
                  scorerIds: (mine.prediction_scorers ?? []).map((s) => s.player_id),
                }
              : null;

            // Build the reveal list (only populated for revealed matches).
            const reveal: RevealRow[] =
              state === "open"
                ? []
                : (revealByMatch.get(m.id) ?? []).map((r) => {
                    const prof = profileById.get(r.user_id);
                    return {
                      userId: r.user_id,
                      name: prof?.name ?? "Player",
                      username: prof?.username ?? "",
                      scoreA: r.score_a,
                      scoreB: r.score_b,
                      scorerIds: (r.prediction_scorers ?? []).map((s) => s.player_id),
                      isMe: r.user_id === user.id,
                    };
                  });

            return (
              <MatchCard
                key={m.id}
                matchId={m.id}
                groupLetter={m.group_letter}
                matchday={m.matchday}
                kickoffAt={m.kickoff_at}
                closeAt={m.predictions_close_at}
                teamA={m.team_a}
                teamB={m.team_b}
                underdog={m.underdog}
                finalScoreA={m.score_a}
                finalScoreB={m.score_b}
                squadA={squadByTeam.get(m.team_a.id) ?? []}
                squadB={squadByTeam.get(m.team_b.id) ?? []}
                myPrediction={myPrediction}
                state={state}
                isNextOpen={m.id === nextOpenId}
                reveal={reveal}
                matchPoints={pointsByMatch.get(m.id) ?? []}
                currentUserId={user.id}
              />
            );
          })}
        </div>
        </div>

        <StandingsPanel variant="aside" top={topStandings} meBelow={meBelow} />
      </main>
    </>
  );
}
