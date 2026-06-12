// Builds the grouped option list for the goal-scorer dropdowns (user prediction
// card + admin result entry). DISPLAY-ONLY: same players, just regrouped so that
// within each team players appear under GK / DEF / MID / FWD headers (in that
// order), shirt-number ascending inside each group. A native <select> can't nest
// <optgroup>s, so we emit one <optgroup> per (team, position). Selecting an option
// still stores player_id — nothing about saving/scoring changes.

export interface ScorerOptionGroup {
  label: string;
  options: { id: number; label: string }[];
}

interface HelperPlayer {
  id: number;
  name: string;
  position: string | null;
  shirt_number: number | null;
}

interface HelperTeam {
  name: string;
  flag: string | null;
  players: HelperPlayer[];
}

const POSITION_ORDER = ["GK", "DEF", "MID", "FWD"] as const;

function byShirt(a: HelperPlayer, b: HelperPlayer): number {
  const sa = a.shirt_number ?? 999;
  const sb = b.shirt_number ?? 999;
  if (sa !== sb) return sa - sb;
  return a.name.localeCompare(b.name);
}

function toOption(p: HelperPlayer): { id: number; label: string } {
  return { id: p.id, label: `#${p.shirt_number ?? "–"} ${p.name}` };
}

export function buildScorerGroups(teams: HelperTeam[]): ScorerOptionGroup[] {
  const groups: ScorerOptionGroup[] = [];

  for (const team of teams) {
    const prefix = team.flag ? `${team.flag} ` : "";
    const used = new Set<number>();

    for (const pos of POSITION_ORDER) {
      const inPos = team.players
        .filter((p) => p.position === pos)
        .sort(byShirt);
      if (inPos.length === 0) continue;
      for (const p of inPos) used.add(p.id);
      groups.push({
        label: `${prefix}${team.name} — ${pos}`,
        options: inPos.map(toOption),
      });
    }

    // Anyone whose position is null or an unrecognised code — keep them visible.
    const other = team.players.filter((p) => !used.has(p.id)).sort(byShirt);
    if (other.length > 0) {
      groups.push({
        label: `${prefix}${team.name} — Other`,
        options: other.map(toOption),
      });
    }
  }

  return groups;
}
