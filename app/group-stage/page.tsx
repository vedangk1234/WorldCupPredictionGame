import SiteHeader from "@/app/components/SiteHeader";
import { requireUser } from "@/lib/auth";
import { computeRound2MatchIds } from "@/lib/round2";
import { computeRound3MatchIds } from "@/lib/round3";
import MatchCard from "@/app/predictions/MatchCard";
import type {
  MatchState,
  CardPlayer,
  CardPrediction,
  RevealRow,
  MatchPointsRow,
  MatchGoalRow,
} from "@/app/predictions/MatchCard";

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
  used_2x: boolean;
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

interface GoalJoin {
  match_id: number;
  minute: string | null;
  is_own_goal: boolean;
  players: { name: string; team_id: number } | null;
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

export default async function GroupStagePage() {
  const { user, supabase, timeZone } = await requireUser();

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
    // Group-stage page shows ONLY group fixtures — the 16 ro32 matches have their
    // own (separate-delivery) user UI and must not leak into this list.
    .eq("stage", "group")
    .order("kickoff_at", { ascending: true });
  const matches = (matchesData ?? []) as unknown as MatchRow[];

  // Round-2 match ids (by kickoff order) for "2x" eligibility — single source of
  // truth shared with the lock server action. A match is 2x-eligible only if it
  // is round-2 AND has no underdog (CLAUDE.md "2x tokens").
  const round2Ids = computeRound2MatchIds(
    matches.map((m) => ({
      id: m.id,
      team_a_id: (m.team_a?.id ?? -1) as number,
      team_b_id: (m.team_b?.id ?? -2) as number,
      kickoff_at: m.kickoff_at,
    })),
  );

  // Round-3 match ids (by kickoff order) for the "superstar" feature. Used only
  // to decide whether to show the ⭐ superstar-rule note (display only — the
  // +3/−3 bonus math lives in the scoring/recompute layer).
  const round3Ids = computeRound3MatchIds(
    matches.map((m) => ({
      id: m.id,
      team_a_id: (m.team_a?.id ?? -1) as number,
      team_b_id: (m.team_b?.id ?? -2) as number,
      kickoff_at: m.kickoff_at,
    })),
  );

  // The current user's own predictions (+ backed scorers) across all matches.
  const { data: myPredsData } = await supabase
    .from("predictions")
    .select("id, user_id, match_id, score_a, score_b, locked, used_2x, prediction_scorers(player_id)")
    .eq("user_id", user.id);
  const myPreds = (myPredsData ?? []) as unknown as PredRow[];
  const myPredByMatch = new Map<number, PredRow>();
  for (const p of myPreds) myPredByMatch.set(p.match_id, p);

  // How many "2x" doublers the user has spent (locked predictions with 2x on).
  // Used to show "X/3 used" and disable the toggle once all 3 are spent.
  const myTokensUsed = myPreds.filter((p) => p.locked && p.used_2x).length;

  // Every player (id → squad info) for the scorer dropdowns and name lookups.
  // Picks are always from the two squads, so this covers every referenced id.
  // NOTE: there are ~1245 players, which exceeds Supabase/PostgREST's default
  // 1000-row response cap. An unbounded select silently returns only the first
  // 1000 rows, dropping the highest-id squads (alphabetically-late teams such as
  // United States) — those teams then show an EMPTY scorer dropdown. Page through
  // in 1000-row chunks, ordered by id for stable paging, so every squad loads.
  const players: CardPlayer[] = [];
  const PLAYER_PAGE = 1000;
  for (let from = 0; ; from += PLAYER_PAGE) {
    const { data: chunk, error: playersErr } = await supabase
      .from("players")
      .select("id, name, position, shirt_number, team_id, is_superstar")
      .order("id", { ascending: true })
      .range(from, from + PLAYER_PAGE - 1);
    if (playersErr) break;
    const rows = (chunk ?? []) as CardPlayer[];
    players.push(...rows);
    if (rows.length < PLAYER_PAGE) break;
  }
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
    // As the tournament fills up, revealed predictions exceed PostgREST's default
    // 1000-row cap. An unbounded select silently drops rows past 1000 (newest
    // round-3 reveals, fetched last) — truncating reveal names/scorelines. Page
    // through in 1000-row chunks, ordered by id for stable paging. (Same bug and
    // fix as the players query above.)
    const PRED_PAGE = 1000;
    for (let from = 0; ; from += PRED_PAGE) {
      const { data: chunk, error: predErr } = await supabase
        .from("predictions")
        .select("id, user_id, match_id, score_a, score_b, locked, used_2x, prediction_scorers(player_id)")
        .in("match_id", revealedIds)
        .order("id", { ascending: true })
        .range(from, from + PRED_PAGE - 1);
      if (predErr) break;
      const rows = (chunk ?? []) as unknown as PredRow[];
      revealRows.push(...rows);
      if (rows.length < PRED_PAGE) break;
    }

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

  // (matchId, userId) → used_2x, for tagging points/reveal rows with the doubler.
  // prediction_points doesn't store used_2x; the revealed predictions do.
  const used2xKey = (matchId: number, userId: string) => `${matchId}:${userId}`;
  const used2xByMatchUser = new Map<string, boolean>();
  for (const r of revealRows) {
    used2xByMatchUser.set(used2xKey(r.match_id, r.user_id), r.used_2x);
  }

  // Points breakdown for finished matches (one query, RLS allows all to read).
  // Rows exist only for finished matches and only for locked predictions.
  const finishedIds = matches.filter((m) => m.finished).map((m) => m.id);
  const pointsByMatch = new Map<number, MatchPointsRow[]>();
  if (finishedIds.length > 0) {
    // Points rows (one per locked prediction per finished match) exceed
    // PostgREST's default 1000-row cap as matches accumulate. An unbounded
    // select silently dropped the rows past 1000 — newest round-3 matches
    // (fetched last, no order) vanished, so finished round-3 matches showed
    // "No locked predictions". Page through in 1000-row chunks, ordered by
    // (match_id, user_id) — a stable unique key (one row per user per match).
    const PTS_PAGE = 1000;
    const ptsRows: PointsRow[] = [];
    for (let from = 0; ; from += PTS_PAGE) {
      const { data: chunk, error: ptsErr } = await supabase
        .from("prediction_points")
        .select("user_id, match_id, winner_pts, gd_pts, exact_pts, scorer_pts, underdog_pts, total_pts")
        .in("match_id", finishedIds)
        .order("match_id", { ascending: true })
        .order("user_id", { ascending: true })
        .range(from, from + PTS_PAGE - 1);
      if (ptsErr) break;
      const rows = (chunk ?? []) as PointsRow[];
      ptsRows.push(...rows);
      if (rows.length < PTS_PAGE) break;
    }
    for (const row of ptsRows) {
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
        used2x: used2xByMatchUser.get(used2xKey(row.match_id, row.user_id)) ?? false,
      });
      pointsByMatch.set(row.match_id, list);
    }
  }

  // Actual scorers for finished matches (one query). Each goal carries its
  // scorer's name + team and the minute (display-only). For an own goal the
  // scorer's player_id is the conceding player, so it counts FOR the other team
  // (the card groups accordingly). See CLAUDE.md §2.2 / schema match_goals.
  const goalsByMatch = new Map<number, MatchGoalRow[]>();
  if (finishedIds.length > 0) {
    // Goal rows (one per goal) also grow past PostgREST's default 1000-row cap.
    // Page through in 1000-row chunks, ordered by id for stable paging, so
    // round-3 scorer/goal detail isn't silently truncated. (Same fix as above.)
    const GOALS_PAGE = 1000;
    const goalRows: GoalJoin[] = [];
    for (let from = 0; ; from += GOALS_PAGE) {
      const { data: chunk, error: goalsErr } = await supabase
        .from("match_goals")
        .select("match_id, minute, is_own_goal, players(name, team_id)")
        .in("match_id", finishedIds)
        .order("id", { ascending: true })
        .range(from, from + GOALS_PAGE - 1);
      if (goalsErr) break;
      const rows = (chunk ?? []) as unknown as GoalJoin[];
      goalRows.push(...rows);
      if (rows.length < GOALS_PAGE) break;
    }
    for (const g of goalRows) {
      const list = goalsByMatch.get(g.match_id) ?? [];
      list.push({
        playerName: g.players?.name ?? "Unknown",
        teamId: g.players?.team_id ?? 0,
        minute: g.minute,
        isOwnGoal: g.is_own_goal,
        isEt: false, // group fixtures never have extra-time goals
      });
      goalsByMatch.set(g.match_id, list);
    }
  }

  // Find the soonest still-open match so we can highlight it as "next up".
  const nextOpenId = matches.find((m) => {
    const mine = myPredByMatch.get(m.id);
    return matchState(m, now, mine?.locked ?? false) === "open";
  })?.id;

  return (
    <>
      <SiteHeader />
      <main className="preds-layout">
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
                  used2x: mine.used_2x,
                  // Group fixtures have no knockout ET / penalty prediction.
                  predEtA: null,
                  predEtB: null,
                  predPenWinnerTeamId: null,
                  scorerIdsEt: [],
                }
              : null;

            const isRound2 = round2Ids.has(m.id);
            const isRound3 = round3Ids.has(m.id);

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
                      used2x: r.used_2x,
                      isMe: r.user_id === user.id,
                      // Group fixtures have no knockout ET / penalty prediction.
                      predEtA: null,
                      predEtB: null,
                      predPenWinnerTeamId: null,
                      scorerIdsEt: [],
                    };
                  });

            return (
              <MatchCard
                key={m.id}
                matchId={m.id}
                stage="group"
                groupLetter={m.group_letter}
                matchday={m.matchday}
                kickoffAt={m.kickoff_at}
                closeAt={m.predictions_close_at}
                userTimeZone={timeZone}
                teamA={m.team_a}
                teamB={m.team_b}
                underdog={m.underdog}
                finalScoreA={m.score_a}
                finalScoreB={m.score_b}
                finalEtScoreA={null}
                finalEtScoreB={null}
                penWinnerTeamId={null}
                squadA={squadByTeam.get(m.team_a.id) ?? []}
                squadB={squadByTeam.get(m.team_b.id) ?? []}
                myPrediction={myPrediction}
                state={state}
                isNextOpen={m.id === nextOpenId}
                isRound2={isRound2}
                isRound3={isRound3}
                tokensUsed={myTokensUsed}
                reveal={reveal}
                matchPoints={pointsByMatch.get(m.id) ?? []}
                goals={goalsByMatch.get(m.id) ?? []}
                currentUserId={user.id}
              />
            );
          })}
        </div>
      </main>
    </>
  );
}
