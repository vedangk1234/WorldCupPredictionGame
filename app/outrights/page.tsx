import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import { requireUser } from "@/lib/auth";
import { fmtTime } from "@/lib/format";
import {
  getOutright,
  scoreOutright,
  flagPrefix,
  FINALIST_TEAM_IDS,
  GOLDEN_BOOT_PLAYER_IDS,
  GOLDEN_GLOVE_PLAYER_IDS,
  GOLDEN_BOOT_GOALS_OPTIONS,
  OUTRIGHT_POINTS,
  OUTRIGHT_TOTAL_POOL,
  type OutrightPrediction,
  type OutrightResult,
} from "@/lib/outrights";
import OutrightsForm, {
  type TeamOption,
  type PlayerOption,
  type PlayerGroup,
} from "./OutrightsForm";

export const dynamic = "force-dynamic";

interface TeamRow {
  id: number;
  name: string;
  code: string | null;
  flag_url: string | null;
}
interface PlayerRow {
  id: number;
  name: string;
  team_id: number;
}

export default async function OutrightsPage() {
  const { user, supabase, timeZone } = await requireUser();

  const outright = await getOutright(supabase);
  if (!outright) {
    return (
      <>
        <SiteHeader />
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
          <BackHome />
          <h1 className="display" style={{ fontSize: 34, margin: "8px 0 12px" }}>
            Outrights
          </h1>
          <p style={{ color: "var(--chalk-dim)" }}>Outrights aren&apos;t open yet.</p>
        </main>
      </>
    );
  }

  const now = Date.now();
  const locked_at_passed = new Date(outright.locks_at).getTime() <= now;

  // The four semi-finalists + their squads (covers the golden-ball pool AND the
  // boot/glove shortlist players, which all belong to these four teams).
  const { data: teamsData } = await supabase
    .from("teams")
    .select("id, name, code, flag_url")
    .in("id", FINALIST_TEAM_IDS);
  const teams = (teamsData ?? []) as TeamRow[];
  const teamById = new Map<number, TeamRow>();
  for (const t of teams) teamById.set(t.id, t);

  const { data: playersData } = await supabase
    .from("players")
    .select("id, name, team_id")
    .in("team_id", FINALIST_TEAM_IDS)
    .order("name", { ascending: true });
  const players = (playersData ?? []) as PlayerRow[];
  const playerById = new Map<number, PlayerRow>();
  for (const p of players) playerById.set(p.id, p);

  // --- Display label helpers ------------------------------------------------
  const teamLabel = (id: number | null): string => {
    if (id == null) return "—";
    const t = teamById.get(id);
    return t ? `${flagPrefix(t.flag_url)}${t.name}` : `#${id}`;
  };
  const playerLabel = (id: number | null): string => {
    if (id == null) return "—";
    const p = playerById.get(id);
    if (!p) return `#${id}`;
    const t = teamById.get(p.team_id);
    return `${flagPrefix(t?.flag_url)}${p.name}`;
  };

  // --- Build the form option lists ------------------------------------------
  // Teams ordered by the bracket (France, Spain, England, Argentina).
  const teamOptions: TeamOption[] = FINALIST_TEAM_IDS.filter((id) => teamById.has(id)).map(
    (id) => ({ id, label: teamLabel(id) }),
  );
  // Boot / glove: preserve the hardcoded shortlist order from the task.
  const bootOptions: PlayerOption[] = GOLDEN_BOOT_PLAYER_IDS.filter((id) => playerById.has(id)).map(
    (id) => ({ id, label: playerLabel(id) }),
  );
  const gloveOptions: PlayerOption[] = GOLDEN_GLOVE_PLAYER_IDS.filter((id) =>
    playerById.has(id),
  ).map((id) => ({ id, label: playerLabel(id) }));
  // Golden Ball: grouped by team (teams by name), players by name within a team.
  const ballGroups: PlayerGroup[] = [...teams]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({
      label: `${flagPrefix(t.flag_url)}${t.name}`,
      options: players
        .filter((p) => p.team_id === t.id)
        .map((p) => ({ id: p.id, label: p.name })),
    }))
    .filter((g) => g.options.length > 0);

  // --- The user's own prediction --------------------------------------------
  const { data: myPredData } = await supabase
    .from("outright_predictions")
    .select(
      "id, user_id, outrights_id, champion_team_id, runner_up_team_id, third_place_team_id, golden_boot_player_id, golden_ball_player_id, golden_glove_player_id, golden_boot_goals, locked, locked_at",
    )
    .eq("outrights_id", outright.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const myPred = (myPredData ?? null) as OutrightPrediction | null;

  // --- The actual results (for the finalised correct/wrong view) ------------
  const { data: resultData } = await supabase
    .from("outright_results")
    .select(
      "outrights_id, champion_team_id, runner_up_team_id, third_place_team_id, golden_boot_player_id, golden_boot_goals, golden_ball_player_id, golden_glove_player_id, finalised, updated_at",
    )
    .eq("outrights_id", outright.id)
    .maybeSingle();
  const result = (resultData ?? null) as OutrightResult | null;
  const finalised = !!result?.finalised;

  // Editable iff the user hasn't locked AND the deadline hasn't passed.
  const editable = !(myPred?.locked ?? false) && !locked_at_passed;

  // Reveal rule (mirrors the match prediction pages): the all-users table shows
  // as soon as the CURRENT USER has LOCKED their own outright, OR the deadline
  // has passed (in which case everyone sees it regardless). RLS enforces the same.
  const canReveal = (myPred?.locked ?? false) || locked_at_passed;

  // --- The seven questions, for the read-only / results views ---------------
  interface QDef {
    n: number;
    title: string;
    points: number;
    predLabel: string;
    resultLabel: string;
    correct: boolean;
    earned: number;
  }
  const scored = myPred && finalised && result ? scoreOutright(myPred, result) : null;
  const questions: QDef[] = myPred
    ? [
        {
          n: 1,
          title: "Champion",
          points: OUTRIGHT_POINTS.champion,
          predLabel: teamLabel(myPred.champion_team_id),
          resultLabel: teamLabel(result?.champion_team_id ?? null),
          correct: !!scored && scored.champion_pts > 0,
          earned: scored?.champion_pts ?? 0,
        },
        {
          n: 2,
          title: "Runner-up",
          points: OUTRIGHT_POINTS.runnerUp,
          predLabel: teamLabel(myPred.runner_up_team_id),
          resultLabel: teamLabel(result?.runner_up_team_id ?? null),
          correct: !!scored && scored.runner_up_pts > 0,
          earned: scored?.runner_up_pts ?? 0,
        },
        {
          n: 3,
          title: "Third place",
          points: OUTRIGHT_POINTS.thirdPlace,
          predLabel: teamLabel(myPred.third_place_team_id),
          resultLabel: teamLabel(result?.third_place_team_id ?? null),
          correct: !!scored && scored.third_place_pts > 0,
          earned: scored?.third_place_pts ?? 0,
        },
        {
          n: 4,
          title: "Golden Boot winner",
          points: OUTRIGHT_POINTS.goldenBoot,
          predLabel: playerLabel(myPred.golden_boot_player_id),
          resultLabel: playerLabel(result?.golden_boot_player_id ?? null),
          correct: !!scored && scored.golden_boot_pts > 0,
          earned: scored?.golden_boot_pts ?? 0,
        },
        {
          n: 5,
          title: "Golden Ball winner",
          points: OUTRIGHT_POINTS.goldenBall,
          predLabel: playerLabel(myPred.golden_ball_player_id),
          resultLabel: playerLabel(result?.golden_ball_player_id ?? null),
          correct: !!scored && scored.golden_ball_pts > 0,
          earned: scored?.golden_ball_pts ?? 0,
        },
        {
          n: 6,
          title: "Golden Glove winner",
          points: OUTRIGHT_POINTS.goldenGlove,
          predLabel: playerLabel(myPred.golden_glove_player_id),
          resultLabel: playerLabel(result?.golden_glove_player_id ?? null),
          correct: !!scored && scored.golden_glove_pts > 0,
          earned: scored?.golden_glove_pts ?? 0,
        },
        {
          n: 7,
          title: "Golden Boot — total goals",
          points: OUTRIGHT_POINTS.bootGoals,
          predLabel: myPred.golden_boot_goals != null ? `${myPred.golden_boot_goals} goals` : "—",
          resultLabel:
            result?.golden_boot_goals != null ? `${result.golden_boot_goals} goals` : "—",
          correct: !!scored && scored.boot_goals_pts > 0,
          earned: scored?.boot_goals_pts ?? 0,
        },
      ]
    : [];

  // --- Everyone's picks (reveal) — only AFTER the deadline ------------------
  // One row per user; each pick already carries its flag-prefixed label so the
  // table cells render straight. `total` stays null until results are finalised
  // (the Points column + correct/wrong highlighting hang off it later).
  interface RevealPick {
    userId: string;
    name: string;
    username: string;
    isMe: boolean;
    total: number | null;
    champion: string;
    runnerUp: string;
    third: string;
    boot: string;
    bootGoals: string;
    ball: string;
    glove: string;
  }
  let revealPicks: RevealPick[] = [];
  if (canReveal) {
    // Chunked pagination (PostgREST caps unbounded reads at 1000 rows).
    const preds: OutrightPrediction[] = [];
    const CHUNK = 1000;
    for (let from = 0; ; from += CHUNK) {
      const { data: page } = await supabase
        .from("outright_predictions")
        .select(
          "id, user_id, outrights_id, champion_team_id, runner_up_team_id, third_place_team_id, golden_boot_player_id, golden_ball_player_id, golden_glove_player_id, golden_boot_goals, locked, locked_at",
        )
        .eq("outrights_id", outright.id)
        .eq("locked", true)
        .order("id", { ascending: true })
        .range(from, from + CHUNK - 1);
      const rows = (page ?? []) as OutrightPrediction[];
      preds.push(...rows);
      if (rows.length < CHUNK) break;
    }
    const userIds = Array.from(new Set(preds.map((p) => p.user_id)));
    const profileById = new Map<string, { name: string; username: string }>();
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
    revealPicks = preds
      .map((p) => {
        const prof = profileById.get(p.user_id);
        return {
          userId: p.user_id,
          name: prof?.name ?? "Player",
          username: prof?.username ?? "",
          isMe: p.user_id === user.id,
          total: finalised && result ? scoreOutright(p, result).total_pts : null,
          champion: teamLabel(p.champion_team_id),
          runnerUp: teamLabel(p.runner_up_team_id),
          third: teamLabel(p.third_place_team_id),
          boot: playerLabel(p.golden_boot_player_id),
          bootGoals: p.golden_boot_goals != null ? `${p.golden_boot_goals}` : "—",
          ball: playerLabel(p.golden_ball_player_id),
          glove: playerLabel(p.golden_glove_player_id),
        };
      })
      // Alphabetical by display name, current user pinned to the top.
      .sort((a, b) => {
        if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
        <BackHome />
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
          FIFA WORLD CUP 2026 · TOURNAMENT OUTRIGHTS
        </p>
        <h1 className="display" style={{ fontSize: 34, lineHeight: 1.05, margin: "8px 0 8px" }}>
          Outrights
        </h1>
        <p style={{ color: "var(--chalk-dim)", fontSize: 13.5, margin: "0 0 6px" }}>
          Seven tournament-long calls · {OUTRIGHT_TOTAL_POOL} points on the line. Locks{" "}
          {fmtTime(outright.locks_at, timeZone)} (your time), before the first semi-final.
        </p>

        {/* State 1 — EDITABLE: the form (prefilled with any saved draft). */}
        {editable ? (
          <div style={{ marginTop: 20 }}>
            <OutrightsForm
              locksAt={outright.locks_at}
              serverNow={now}
              teamOptions={teamOptions}
              bootOptions={bootOptions}
              gloveOptions={gloveOptions}
              ballGroups={ballGroups}
              goalsOptions={GOLDEN_BOOT_GOALS_OPTIONS}
              initial={
                myPred
                  ? {
                      championTeamId: myPred.champion_team_id,
                      runnerUpTeamId: myPred.runner_up_team_id,
                      thirdPlaceTeamId: myPred.third_place_team_id,
                      goldenBootPlayerId: myPred.golden_boot_player_id,
                      goldenBallPlayerId: myPred.golden_ball_player_id,
                      goldenGlovePlayerId: myPred.golden_glove_player_id,
                      goldenBootGoals: myPred.golden_boot_goals,
                    }
                  : null
              }
            />
          </div>
        ) : (
          /* State 2 — READ-ONLY: the user's own locked/closed picks. */
          <div style={{ marginTop: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Your picks</h2>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: "3px 9px",
                  borderRadius: 99,
                  background: "rgba(243,201,105,0.16)",
                  color: "var(--gold-300)",
                  border: "1px solid rgba(243,201,105,0.45)",
                }}
              >
                {myPred?.locked ? "Locked 🔒" : "Closed"}
              </span>
              {scored && (
                <span
                  className="display tnum"
                  style={{ marginLeft: "auto", fontSize: 16, fontWeight: 800, color: "var(--gold-300)" }}
                >
                  {scored.total_pts} / {OUTRIGHT_TOTAL_POOL} pts
                </span>
              )}
            </div>

            {!myPred ? (
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
                You didn&apos;t lock any outrights before the deadline — 0 points.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {questions.map((q) => (
                  <div
                    key={q.n}
                    style={{
                      background: "var(--pitch-900)",
                      border: "1px solid var(--pitch-line)",
                      borderRadius: 12,
                      padding: "12px 14px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        flexWrap: "wrap",
                        alignItems: "baseline",
                      }}
                    >
                      <span style={{ fontSize: 12.5, color: "var(--chalk-dim)", fontWeight: 600 }}>
                        {q.title} · {q.points} pts
                      </span>
                      {finalised && (
                        <span
                          className="tnum"
                          style={{
                            fontSize: 12.5,
                            fontWeight: 800,
                            color: q.correct ? "var(--pitch-500)" : "var(--m3)",
                          }}
                        >
                          {q.correct ? `✓ +${q.earned}` : "✗ 0"}
                        </span>
                      )}
                    </div>
                    <div className="display" style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>
                      {q.predLabel}
                    </div>
                    {finalised && !q.correct && (
                      <div style={{ fontSize: 12.5, color: "var(--chalk-dim)", marginTop: 4 }}>
                        Actual: {q.resultLabel}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Everyone's picks — revealed once the user has locked (or the deadline
            has passed). Until then, hidden behind a lock-to-reveal hint. */}
        {!canReveal ? (
          <div style={{ marginTop: 28 }}>
            <p
              style={{
                fontSize: 13.5,
                color: "var(--chalk-dim)",
                fontWeight: 600,
                background: "var(--pitch-900)",
                border: "1px solid var(--pitch-line)",
                borderRadius: 10,
                padding: "12px 14px",
              }}
            >
              🔒 Lock your picks to see what everyone else predicted.
            </p>
          </div>
        ) : (
          <div style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 12px" }}>
              Everyone&apos;s outrights ({revealPicks.length})
            </h2>
            {revealPicks.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--chalk-dim)" }}>No outrights were locked in.</p>
            ) : (
              /* Mirrors the per-match prediction leaderboard: bordered/rounded
                 shell, horizontal-scroll wrapper for mobile, collapsed borders,
                 uppercase muted headers, current-user row highlight. When results
                 are finalised, add a "Points" column here + per-cell correct/wrong
                 tinting keyed off r.total / a per-question scoreOutright result. */
              <div
                style={{
                  border: "1px solid var(--pitch-line)",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "var(--chalk-dim)" }}>
                        <th style={headCell("left")}>Player</th>
                        <th style={headCell("left")}>Champion</th>
                        <th style={headCell("left")}>Runner-up</th>
                        <th style={headCell("left")}>Third</th>
                        <th style={headCell("left")}>Boot</th>
                        <th style={headCell("right")}>Boot Goals</th>
                        <th style={headCell("left")}>Ball</th>
                        <th style={headCell("left")}>Glove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revealPicks.map((r) => {
                        const rowBg = r.isMe ? "rgba(31,164,99,0.12)" : "transparent";
                        return (
                          <tr
                            key={r.userId}
                            style={{ background: rowBg, borderTop: "1px solid var(--pitch-line)" }}
                          >
                            <td style={{ ...bodyCell, textAlign: "left" }}>
                              <span style={{ fontWeight: 600 }}>{r.name}</span>
                              {r.username ? (
                                <span style={{ color: "var(--chalk-dim)", fontWeight: 400 }}>
                                  {" "}
                                  ({r.username})
                                </span>
                              ) : null}
                              {r.isMe ? (
                                <span style={{ color: "var(--pitch-500)", fontWeight: 600 }}> · you</span>
                              ) : null}
                            </td>
                            <td style={{ ...bodyCell, textAlign: "left" }}>{r.champion}</td>
                            <td style={{ ...bodyCell, textAlign: "left" }}>{r.runnerUp}</td>
                            <td style={{ ...bodyCell, textAlign: "left" }}>{r.third}</td>
                            <td style={{ ...bodyCell, textAlign: "left" }}>{r.boot}</td>
                            <td className="tnum" style={bodyCell}>{r.bootGoals}</td>
                            <td style={{ ...bodyCell, textAlign: "left" }}>{r.ball}</td>
                            <td style={{ ...bodyCell, textAlign: "left" }}>{r.glove}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

// Table cell styling lifted from the per-match prediction leaderboard so both
// boards read identically (padding, muted uppercase headers, tabular figures).
const bodyCell: React.CSSProperties = {
  padding: "8px 8px",
  textAlign: "right",
  whiteSpace: "nowrap",
  fontSize: 13,
};

function headCell(align: "left" | "right"): React.CSSProperties {
  return {
    ...bodyCell,
    textAlign: align,
    fontSize: 11,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  };
}

function BackHome() {
  return (
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
  );
}
