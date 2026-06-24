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
  // DISPLAY-ONLY: when true the option label is prefixed with ⭐. Selection still
  // stores the same player_id. The admin dropdown doesn't pass this, so no star
  // shows there — only the user prediction card supplies it.
  is_superstar?: boolean | null;
}

interface HelperTeam {
  name: string;
  flag: string | null;
  players: HelperPlayer[];
}

const POSITION_ORDER = ["GK", "DEF", "MID", "FWD"] as const;
type Position = (typeof POSITION_ORDER)[number];

// Map whatever the data has to one of our four buckets. Robust to case and to
// common variants (DF/MF/FW, full words, etc.). Anything we don't recognise —
// including null — returns null and falls into the team's "Other" group so the
// player is NEVER dropped from the dropdown.
function normalizePosition(raw: string | null): Position | null {
  if (!raw) return null;
  const p = raw.trim().toUpperCase();
  if (p === "GK" || p.startsWith("GOAL")) return "GK";
  if (p === "DEF" || p === "DF" || p.startsWith("DEFEN") || p === "CB" || p === "LB" || p === "RB" || p === "WB")
    return "DEF";
  if (p === "MID" || p === "MF" || p.startsWith("MIDFIELD") || p === "CM" || p === "DM" || p === "AM")
    return "MID";
  if (p === "FWD" || p === "FW" || p.startsWith("FORWARD") || p.startsWith("ATTACK") || p === "ATT" || p === "ST" || p === "CF" || p === "WG")
    return "FWD";
  return null;
}

function byShirt(a: HelperPlayer, b: HelperPlayer): number {
  const sa = a.shirt_number ?? 999;
  const sb = b.shirt_number ?? 999;
  if (sa !== sb) return sa - sb;
  return a.name.localeCompare(b.name);
}

function toOption(p: HelperPlayer): { id: number; label: string } {
  const star = p.is_superstar ? "⭐ " : "";
  return { id: p.id, label: `${star}#${p.shirt_number ?? "–"} ${p.name}` };
}

export function buildScorerGroups(teams: HelperTeam[]): ScorerOptionGroup[] {
  const groups: ScorerOptionGroup[] = [];

  for (const team of teams) {
    const prefix = team.flag ? `${team.flag} ` : "";
    const used = new Set<number>();

    for (const pos of POSITION_ORDER) {
      const inPos = team.players
        .filter((p) => normalizePosition(p.position) === pos)
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

    // Guard: a team that HAS players must never render zero options. The loop +
    // "Other" fallback already guarantees this (every player is either bucketed
    // or lands in `other`), but assert it so a future regression surfaces loudly
    // instead of silently hiding a whole squad like the 1000-row truncation did.
    if (team.players.length > 0 && !used.size && other.length === 0) {
      groups.push({
        label: `${prefix}${team.name} — Other`,
        options: [...team.players].sort(byShirt).map(toOption),
      });
    }
  }

  return groups;
}
