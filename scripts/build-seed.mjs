// =============================================================================
// build-seed.mjs — World Cup 2026 seed generator (Phase 2, step 1)
//
// Fetches the public-domain openfootball/worldcup.json 2026 dataset and
// transforms it into supabase/seed.sql (48 teams, ~1245 players, 72 group
// matches). No external deps; Node 18+ (uses global fetch). Re-runnable.
//
//   node scripts/build-seed.mjs
//
// Then paste supabase/seed.sql into the Supabase SQL Editor and Run it.
// =============================================================================

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'supabase', 'seed.sql');

const BASE =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026';
const SOURCES = {
  matches: `${BASE}/worldcup.json`,
  squads: `${BASE}/worldcup.squads.json`,
  teams: `${BASE}/worldcup.teams.json`,
};

// Fixtures / teams.json use a few name variants; squads.json is canonical.
const NAME_FIXES = {
  USA: 'United States',
  'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
};
const canon = (n) => NAME_FIXES[n] ?? n;

// openfootball position code → our four-value enum.
const POS_MAP = { GK: 'GK', DF: 'DEF', MF: 'MID', FW: 'FWD' };

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

// SQL single-quoted string literal (double up embedded quotes; keep UTF-8).
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---- parse "13:00 UTC-6" + "2026-06-11" → ISO UTC 'Z' --------------------
function toUtcIso(dateStr, timeStr) {
  const m = timeStr.match(/^(\d{1,2}):(\d{2})\s+UTC([+-]\d{1,2})$/);
  if (!m) die(`Unparseable time string: "${timeStr}"`);
  const [, hh, mm, off] = m;
  const [y, mo, d] = dateStr.split('-').map(Number);
  // Local wall-clock at the given offset → UTC epoch: subtract the offset.
  const utcMs = Date.UTC(y, mo - 1, d, Number(hh), Number(mm)) - Number(off) * 3600_000;
  return new Date(utcMs).toISOString().replace('.000Z', 'Z');
}

function minus5min(iso) {
  return new Date(new Date(iso).getTime() - 5 * 60_000)
    .toISOString()
    .replace('.000Z', 'Z');
}

async function main() {
  console.log('Fetching openfootball 2026 dataset…');
  let squadsRaw, teamsRaw, matchesRaw;
  try {
    [squadsRaw, teamsRaw, matchesRaw] = await Promise.all([
      fetchJson(SOURCES.squads),
      fetchJson(SOURCES.teams),
      fetchJson(SOURCES.matches),
    ]);
  } catch (e) {
    die(
      `Fetch failed (${e.message}).\n` +
        `  Fallback: git clone --depth 1 https://github.com/openfootball/worldcup.json.git\n` +
        `  then read 2026/worldcup.squads.json, .json, .teams.json locally.`
    );
  }

  // squads.json may be a bare array or wrapped; normalize.
  const squads = Array.isArray(squadsRaw) ? squadsRaw : squadsRaw.teams;
  if (!Array.isArray(squads)) die('squads.json: could not find team array.');

  // teams.json: array of { name, code/fifa_code, flag_icon, ... }
  const teamsMeta = Array.isArray(teamsRaw) ? teamsRaw : teamsRaw.teams;
  const metaByName = new Map();
  for (const t of teamsMeta) {
    metaByName.set(canon(t.name), t);
  }

  // ---- Teams ----------------------------------------------------------------
  const canonNames = new Set();
  const teams = squads.map((s) => {
    const name = canon(s.name);
    canonNames.add(name);
    const meta = metaByName.get(name) ?? {};
    const code = s.fifa_code || meta.code || meta.fifa_code || '';
    const flag = meta.flag_icon || meta.flag || '';
    return { name, code, group: s.group, flag };
  });
  teams.sort((a, b) =>
    a.group === b.group ? a.name.localeCompare(b.name) : a.group.localeCompare(b.group)
  );

  // ---- Players --------------------------------------------------------------
  const players = [];
  for (const s of squads) {
    const team = canon(s.name);
    for (const p of s.players ?? []) {
      const position = POS_MAP[p.pos];
      if (!position) die(`Unknown position code "${p.pos}" for ${p.name} (${team})`);
      players.push({ team, name: p.name, position, num: p.number });
    }
  }
  players.sort((a, b) =>
    a.team === b.team ? (a.num ?? 0) - (b.num ?? 0) : a.team.localeCompare(b.team)
  );

  // ---- Matches (group stage only) ------------------------------------------
  const matchList = Array.isArray(matchesRaw) ? matchesRaw : matchesRaw.matches;
  if (!Array.isArray(matchList)) die('worldcup.json: could not find matches array.');

  const unresolved = new Set();
  const matches = [];
  for (const mt of matchList) {
    if (!mt.group || !String(mt.group).startsWith('Group')) continue;
    const teamA = canon(mt.team1);
    const teamB = canon(mt.team2);
    if (!canonNames.has(teamA)) unresolved.add(`${mt.team1} → ${teamA}`);
    if (!canonNames.has(teamB)) unresolved.add(`${mt.team2} → ${teamB}`);
    const grp = String(mt.group).replace(/^Group\s+/, '');
    const md = Number(String(mt.round).match(/\d+/)?.[0] ?? 0);
    const kickoff = toUtcIso(mt.date, mt.time);
    const close = minus5min(kickoff);
    matches.push({ teamA, teamB, grp, md, kickoff, close });
  }
  matches.sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  // ---- Assertions -----------------------------------------------------------
  if (unresolved.size)
    die(`Fixture team names that didn't match a squad team:\n  ${[...unresolved].join('\n  ')}`);
  if (teams.length !== 48) die(`Expected 48 teams, got ${teams.length}.`);
  if (matches.length !== 72) die(`Expected 72 group matches, got ${matches.length}.`);

  // ---- Build SQL ------------------------------------------------------------
  const lines = [];
  lines.push('-- =============================================================================');
  lines.push('-- World Cup 2026 — SEED DATA  (teams, squads, group-stage fixtures)');
  lines.push('-- Generated by scripts/build-seed.mjs from openfootball/worldcup.json (2026).');
  lines.push('-- Run AFTER schema.sql, BEFORE any predictions exist. Safe to re-run.');
  lines.push('-- =============================================================================');
  lines.push('');
  lines.push('delete from public.match_goals;');
  lines.push('delete from public.matches;');
  lines.push('delete from public.players;');
  lines.push('delete from public.teams;');
  lines.push('');

  // Teams
  lines.push('-- ---- teams ----------------------------------------------------------------');
  lines.push('insert into public.teams (name, code, group_letter, flag_url) values');
  lines.push(
    teams
      .map(
        (t, i) =>
          `  (${q(t.name)},${q(t.code)},${q(t.group)},${q(t.flag)})${
            i === teams.length - 1 ? ';' : ','
          }`
      )
      .join('\n')
  );
  lines.push('');

  // Players
  lines.push('-- ---- players (joined to teams by name) ------------------------------------');
  lines.push('insert into public.players (team_id, name, position, shirt_number)');
  lines.push('select t.id, v.name, v.position, v.num');
  lines.push('from (values');
  lines.push(
    players
      .map(
        (p, i) =>
          `  (${q(p.team)},${q(p.name)},${q(p.position)},${p.num ?? 'null'})${
            i === players.length - 1 ? '' : ','
          }`
      )
      .join('\n')
  );
  lines.push(') as v(team, name, position, num)');
  lines.push('join public.teams t on t.name = v.team;');
  lines.push('');

  // Matches
  lines.push('-- ---- matches (group stage; joined to teams by name twice) -----------------');
  lines.push(
    'insert into public.matches (team_a_id, team_b_id, group_letter, matchday, kickoff_at, predictions_close_at)'
  );
  lines.push('select a.id, b.id, v.grp, v.md, v.kickoff::timestamptz, v.close::timestamptz');
  lines.push('from (values');
  lines.push(
    matches
      .map(
        (m, i) =>
          `  (${q(m.teamA)},${q(m.teamB)},${q(m.grp)},${m.md},${q(m.kickoff)},${q(m.close)})${
            i === matches.length - 1 ? '' : ','
          }`
      )
      .join('\n')
  );
  lines.push(') as v(team_a, team_b, grp, md, kickoff, close)');
  lines.push('join public.teams a on a.name = v.team_a');
  lines.push('join public.teams b on b.name = v.team_b;');
  lines.push('');

  writeFileSync(OUT, lines.join('\n'), 'utf8');

  // ---- Summary --------------------------------------------------------------
  const firstMatch = matches[0];
  console.log('\n✓ Wrote supabase/seed.sql');
  console.log(`  teams:        ${teams.length}  (expect 48)`);
  console.log(`  players:      ${players.length}  (expect ~1245)`);
  console.log(`  group matches: ${matches.length}  (expect 72)`);
  console.log(
    `\n  first match row:\n    (${q(firstMatch.teamA)},${q(firstMatch.teamB)},${q(
      firstMatch.grp
    )},${firstMatch.md},${q(firstMatch.kickoff)},${q(firstMatch.close)})`
  );
  console.log('\n→ Paste supabase/seed.sql into the Supabase SQL Editor and click Run (just like schema.sql).');
}

main().catch((e) => die(e.stack || e.message));
