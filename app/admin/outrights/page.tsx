import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { fmtIST } from "@/lib/format";
import {
  getOutright,
  flagPrefix,
  FINALIST_TEAM_IDS,
  GOLDEN_BOOT_PLAYER_IDS,
  GOLDEN_GLOVE_PLAYER_IDS,
  GOLDEN_BOOT_GOALS_OPTIONS,
  type OutrightResult,
} from "@/lib/outrights";
import AdminOutrightsForm, {
  type TeamOption,
  type PlayerOption,
  type PlayerGroup,
} from "./AdminOutrightsForm";

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

export default async function AdminOutrightsPage() {
  const { supabase } = await requireAdmin();

  const outright = await getOutright(supabase);

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

  const teamLabel = (id: number) => {
    const t = teamById.get(id);
    return t ? `${flagPrefix(t.flag_url)}${t.name}` : `#${id}`;
  };
  const playerLabel = (id: number) => {
    const p = playerById.get(id);
    if (!p) return `#${id}`;
    const t = teamById.get(p.team_id);
    return `${flagPrefix(t?.flag_url)}${p.name}`;
  };

  const teamOptions: TeamOption[] = FINALIST_TEAM_IDS.filter((id) => teamById.has(id)).map((id) => ({
    id,
    label: teamLabel(id),
  }));
  const bootOptions: PlayerOption[] = GOLDEN_BOOT_PLAYER_IDS.filter((id) => playerById.has(id)).map(
    (id) => ({ id, label: playerLabel(id) }),
  );
  const gloveOptions: PlayerOption[] = GOLDEN_GLOVE_PLAYER_IDS.filter((id) =>
    playerById.has(id),
  ).map((id) => ({ id, label: playerLabel(id) }));
  const ballGroups: PlayerGroup[] = [...teams]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({
      label: `${flagPrefix(t.flag_url)}${t.name}`,
      options: players.filter((p) => p.team_id === t.id).map((p) => ({ id: p.id, label: p.name })),
    }))
    .filter((g) => g.options.length > 0);

  let result: OutrightResult | null = null;
  let lockedCount = 0;
  if (outright) {
    const { data: resultData } = await supabase
      .from("outright_results")
      .select(
        "outrights_id, champion_team_id, runner_up_team_id, third_place_team_id, golden_boot_player_id, golden_boot_goals, golden_ball_player_id, golden_glove_player_id, finalised, updated_at",
      )
      .eq("outrights_id", outright.id)
      .maybeSingle();
    result = (resultData ?? null) as OutrightResult | null;

    const { count } = await supabase
      .from("outright_predictions")
      .select("id", { count: "exact", head: true })
      .eq("outrights_id", outright.id)
      .eq("locked", true);
    lockedCount = count ?? 0;
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
      <Link
        href="/admin"
        style={{
          display: "inline-block",
          color: "var(--chalk-dim)",
          textDecoration: "none",
          fontSize: 13.5,
          fontWeight: 600,
          marginBottom: 16,
        }}
      >
        ← Admin
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
        ADMIN · OUTRIGHTS
      </p>
      <h1 className="display" style={{ fontSize: 30, lineHeight: 1.05, margin: "8px 0 8px" }}>
        Outrights results
      </h1>

      {!outright ? (
        <p style={{ color: "var(--m3)", marginTop: 16 }}>
          No outrights competition exists in the database.
        </p>
      ) : (
        <>
          <p style={{ color: "var(--chalk-dim)", fontSize: 13.5, margin: "0 0 20px" }}>
            {outright.title ?? "Outrights"} · locks {fmtIST(outright.locks_at)}.
          </p>
          <AdminOutrightsForm
            teamOptions={teamOptions}
            bootOptions={bootOptions}
            gloveOptions={gloveOptions}
            ballGroups={ballGroups}
            goalsOptions={GOLDEN_BOOT_GOALS_OPTIONS}
            initial={
              result
                ? {
                    championTeamId: result.champion_team_id,
                    runnerUpTeamId: result.runner_up_team_id,
                    thirdPlaceTeamId: result.third_place_team_id,
                    goldenBootPlayerId: result.golden_boot_player_id,
                    goldenBallPlayerId: result.golden_ball_player_id,
                    goldenGlovePlayerId: result.golden_glove_player_id,
                    goldenBootGoals: result.golden_boot_goals,
                    finalised: result.finalised,
                  }
                : null
            }
            lockedCount={lockedCount}
          />
        </>
      )}
    </main>
  );
}
