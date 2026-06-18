// Round-2 eligibility for the "2x points" feature (CLAUDE.md "2x tokens").
//
// The `matchday` column is unreliable, so a match's round is derived purely from
// KICKOFF ORDER: for each team, order its matches by kickoff_at; the match at
// position 2 is that team's round-2 match (the SQL equivalent of
// row_number() over (partition by team order by kickoff_at) = 2). A match is
// "round 2" only if it is the 2nd match for BOTH of its teams.
//
// This is the single source of truth for round-2 eligibility and is used both on
// the predictions page (UI) and in the lock server action (authority).

export interface Round2Match {
  id: number;
  team_a_id: number;
  team_b_id: number;
  kickoff_at: string;
}

export function computeRound2MatchIds(matches: Round2Match[]): Set<number> {
  // team_id → its matches, to be ordered by kickoff.
  const byTeam = new Map<number, { id: number; kickoff: number }[]>();
  for (const m of matches) {
    const kickoff = new Date(m.kickoff_at).getTime();
    for (const teamId of [m.team_a_id, m.team_b_id]) {
      const list = byTeam.get(teamId) ?? [];
      list.push({ id: m.id, kickoff });
      byTeam.set(teamId, list);
    }
  }

  // For each team, its 2nd match (index 1) ordered by kickoff (id breaks ties).
  const secondMatchOfTeam = new Map<number, number>();
  for (const [teamId, list] of byTeam) {
    list.sort((a, b) => a.kickoff - b.kickoff || a.id - b.id);
    if (list.length >= 2) secondMatchOfTeam.set(teamId, list[1].id);
  }

  // A match is round-2 only if it is the 2nd match for BOTH teams.
  const round2 = new Set<number>();
  for (const m of matches) {
    if (
      secondMatchOfTeam.get(m.team_a_id) === m.id &&
      secondMatchOfTeam.get(m.team_b_id) === m.id
    ) {
      round2.add(m.id);
    }
  }
  return round2;
}
