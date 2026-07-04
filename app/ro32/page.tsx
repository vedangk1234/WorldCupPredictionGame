import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import { requireUser } from "@/lib/auth";
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

// The Round of 32 knockout matches (moved off the home page, which now shows the
// Round of 16). Reached from the navbar hamburger menu. The match experience is
// identical to the group stage / RO16 — MatchCard handles the knockout
// extra-time / penalty flow when stage='ro32'. Logged-out users → /login.

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
  stage: "group" | "ro32" | "ro16";
  et_score_a: number | null;
  et_score_b: number | null;
  pen_winner_team_id: number | null;
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
  pred_et_a: number | null;
  pred_et_b: number | null;
  pred_pen_winner_team_id: number | null;
  prediction_scorers: { player_id: number; is_et: boolean }[] | null;
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
  is_et: boolean;
  players: { name: string; team_id: number } | null;
}

function matchState(m: MatchRow, now: number, myLocked: boolean): MatchState {
  if (m.finished) return "finished";
  if (new Date(m.predictions_close_at).getTime() <= now) return "closed";
  if (myLocked) return "locked";
  return "open";
}

// FT vs ET scorer pick split (prediction_scorers.is_et).
function ftPicks(rows: { player_id: number; is_et: boolean }[] | null): number[] {
  return (rows ?? []).filter((s) => !s.is_et).map((s) => s.player_id);
}
function etPicks(rows: { player_id: number; is_et: boolean }[] | null): number[] {
  return (rows ?? []).filter((s) => s.is_et).map((s) => s.player_id);
}

export default async function Ro32Page() {
  const { user, supabase, timeZone } = await requireUser();

  // Round-of-32 matches, soonest first, with both teams + underdog joined.
  const { data: matchesData, error: matchErr } = await supabase
    .from("matches")
    .select(
      `id, group_letter, matchday, kickoff_at, predictions_close_at,
       underdog_team_id, score_a, score_b, finished,
       stage, et_score_a, et_score_b, pen_winner_team_id,
       team_a:teams!matches_team_a_id_fkey(id, name, code, flag_url),
       team_b:teams!matches_team_b_id_fkey(id, name, code, flag_url),
       underdog:teams!matches_underdog_team_id_fkey(id, name, code, flag_url)`,
    )
    // This screen is the Round of 32 — group fixtures live at /group-stage and
    // the Round of 16 lives on the home page; neither must leak into this list.
    .eq("stage", "ro32")
    .order("kickoff_at", { ascending: true });
  const matches = (matchesData ?? []) as unknown as MatchRow[];

  // The current user's own predictions (+ backed scorers, FT and ET) across all
  // ro32 matches.
  const { data: myPredsData } = await supabase
    .from("predictions")
    .select(
      "id, user_id, match_id, score_a, score_b, locked, used_2x, pred_et_a, pred_et_b, pred_pen_winner_team_id, prediction_scorers(player_id, is_et)",
    )
    .eq("user_id", user.id);
  const myPreds = (myPredsData ?? []) as unknown as PredRow[];
  const myPredByMatch = new Map<number, PredRow>();
  for (const p of myPreds) myPredByMatch.set(p.match_id, p);

  // Every player (id → squad info) for the scorer dropdowns and name lookups.
  // There are ~1245 players, exceeding PostgREST's default 1000-row cap — page
  // through in 1000-row chunks, ordered by id, so every squad loads (a verbatim
  // carry-over of the group-stage fix).
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

  // Pull all predictions for revealed matches (RLS-gated) + predictor profiles.
  let revealRows: PredRow[] = [];
  const profileById = new Map<string, { name: string; username: string }>();
  if (revealedIds.length > 0) {
    // Page in 1000-row chunks, ordered by id (PostgREST caps responses at 1000).
    const PRED_PAGE = 1000;
    for (let from = 0; ; from += PRED_PAGE) {
      const { data: chunk, error: predErr } = await supabase
        .from("predictions")
        .select(
          "id, user_id, match_id, score_a, score_b, locked, used_2x, pred_et_a, pred_et_b, pred_pen_winner_team_id, prediction_scorers(player_id, is_et)",
        )
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

  // (matchId, userId) → used_2x, for tagging points rows with the doubler.
  const used2xKey = (matchId: number, userId: string) => `${matchId}:${userId}`;
  const used2xByMatchUser = new Map<string, boolean>();
  for (const r of revealRows) {
    used2xByMatchUser.set(used2xKey(r.match_id, r.user_id), r.used_2x);
  }

  // Points breakdown for finished matches (one query, RLS allows all to read).
  const finishedIds = matches.filter((m) => m.finished).map((m) => m.id);
  const pointsByMatch = new Map<number, MatchPointsRow[]>();
  if (finishedIds.length > 0) {
    // Page in 1000-row chunks, ordered by (match_id, user_id) — a stable unique
    // key (one points row per user per finished match).
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

  // Actual scorers for finished matches (one query), split FT vs ET via is_et.
  const goalsByMatch = new Map<number, MatchGoalRow[]>();
  if (finishedIds.length > 0) {
    // Page in 1000-row chunks, ordered by id for stable paging.
    const GOALS_PAGE = 1000;
    const goalRows: GoalJoin[] = [];
    for (let from = 0; ; from += GOALS_PAGE) {
      const { data: chunk, error: goalsErr } = await supabase
        .from("match_goals")
        .select("match_id, minute, is_own_goal, is_et, players(name, team_id)")
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
        isEt: g.is_et,
      });
      goalsByMatch.set(g.match_id, list);
    }
  }

  // Find the soonest still-open match to highlight as "next up".
  const nextOpenId = matches.find((m) => {
    const mine = myPredByMatch.get(m.id);
    return matchState(m, now, mine?.locked ?? false) === "open";
  })?.id;

  return (
    <>
      <SiteHeader />
      <main className="preds-layout">
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
          FIFA WORLD CUP 2026 · KNOCKOUTS
        </p>
        <h1 className="display" style={{ fontSize: 38, lineHeight: 1.05, margin: "8px 0 16px" }}>
          Round of 32
        </h1>

        {matchErr && (
          <p style={{ color: "var(--m3)", marginTop: 20 }}>
            Failed to load matches: {matchErr.message}
          </p>
        )}
        {!matchErr && matches.length === 0 && (
          <p style={{ color: "var(--chalk-dim)", marginTop: 20 }}>
            No Round of 32 matches yet. Check back once they&apos;re set.
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
                  scorerIds: ftPicks(mine.prediction_scorers),
                  used2x: mine.used_2x,
                  predEtA: mine.pred_et_a,
                  predEtB: mine.pred_et_b,
                  predPenWinnerTeamId: mine.pred_pen_winner_team_id,
                  scorerIdsEt: etPicks(mine.prediction_scorers),
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
                      scorerIds: ftPicks(r.prediction_scorers),
                      used2x: r.used_2x,
                      isMe: r.user_id === user.id,
                      predEtA: r.pred_et_a,
                      predEtB: r.pred_et_b,
                      predPenWinnerTeamId: r.pred_pen_winner_team_id,
                      scorerIdsEt: etPicks(r.prediction_scorers),
                    };
                  });

            return (
              <MatchCard
                key={m.id}
                matchId={m.id}
                stage="ro32"
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
                finalEtScoreA={m.et_score_a}
                finalEtScoreB={m.et_score_b}
                penWinnerTeamId={m.pen_winner_team_id}
                squadA={squadByTeam.get(m.team_a.id) ?? []}
                squadB={squadByTeam.get(m.team_b.id) ?? []}
                myPrediction={myPrediction}
                state={state}
                isNextOpen={m.id === nextOpenId}
                isRound2={false}
                isRound3={false}
                tokensUsed={0}
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
