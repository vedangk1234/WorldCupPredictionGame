// One-off maintenance script: recompute prediction_points for the finished
// knockout matches that were LEVEL at full-time, under the (already-shipped)
// knockout FT-winner rule change — see CLAUDE.md §2.10 and the 2026-07-12
// changelog entry.
//
//   Dry-run (DEFAULT — reads only, writes NOTHING):
//     npm run recompute:ko
//   Commit the new rows:
//     npm run recompute:ko -- --commit
//   One match at a time:
//     npm run recompute:ko -- --match=74
//
// It does NOT reimplement any scoring: it imports the pure engine
// `scorePrediction` from lib/scoring.ts and mirrors the admin recompute layer's
// `used_2x` doubling (app/admin/actions.ts → recomputeMatch) byte-for-byte.
// Every Supabase read is paged in 1000-row chunks — PostgREST silently caps a
// single response at 1000 rows and this project has been bitten by that before.
//
// Connecting: needs authenticated + admin access (RLS is `to authenticated`,
// prediction_points writes are `is_admin()`-only). Provide EITHER a service-role
// key (preferred — bypasses RLS) or admin login credentials via env:
//   SUPABASE_URL                 (falls back to NEXT_PUBLIC_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY    (preferred)
//   — or —
//   SUPABASE_ADMIN_USERNAME + SUPABASE_ADMIN_PASSWORD  (+ NEXT_PUBLIC_SUPABASE_ANON_KEY)
// Env is read from the real environment first, then .env.local.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { scorePrediction, ActualGoal } from "@/lib/scoring";
import { computeRound3MatchIds } from "@/lib/round3";
import { usernameToEmail } from "@/lib/username";
import type { Stage } from "@/lib/types";

// The 8 finished knockout matches that were level at FT (the ones the rule
// change can affect). --match=<id> narrows to one of these.
const TARGET_MATCH_IDS = [74, 75, 82, 86, 88, 96, 99, 100];

const PAGE = 1000;

// supabase-js eagerly wires up a Realtime client whose env-detection throws on
// Node < 22 ("no native WebSocket"). This script never opens a realtime channel,
// so we hand it a harmless stub WebSocket constructor just to satisfy detection —
// it is never actually instantiated.
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  (globalThis as { WebSocket?: unknown }).WebSocket = class {
    constructor() {
      throw new Error("Realtime is not used by this script.");
    }
  };
}

// ---------------------------------------------------------------------------
// Tiny .env.local loader (no dotenv dependency). Real process.env wins.
// ---------------------------------------------------------------------------
function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // no .env.local — rely on the real environment.
  }
}

// ---------------------------------------------------------------------------
// Generic chunked reader. `run(from, to)` must apply .range(from, to) and return
// the PostgREST result; we loop until a short page. Never assume < 1000 rows.
// ---------------------------------------------------------------------------
async function paged<T>(
  run: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Build the Supabase client from env (service-role preferred, admin-login fallback).
// ---------------------------------------------------------------------------
async function makeClient(): Promise<SupabaseClient> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).");

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    console.log("Auth: service-role key (RLS bypassed).");
    return createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminUser = process.env.SUPABASE_ADMIN_USERNAME;
  const adminPass = process.env.SUPABASE_ADMIN_PASSWORD;
  if (anonKey && adminUser && adminPass) {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(adminUser),
      password: adminPass,
    });
    if (error) throw new Error(`Admin login failed: ${error.message}`);
    console.log(`Auth: signed in as admin '${adminUser}'.`);
    return supabase;
  }

  throw new Error(
    "No credentials. Set SUPABASE_SERVICE_ROLE_KEY (preferred), or " +
      "SUPABASE_ADMIN_USERNAME + SUPABASE_ADMIN_PASSWORD (with NEXT_PUBLIC_SUPABASE_ANON_KEY).",
  );
}

// ---------------------------------------------------------------------------
// Types mirroring the columns we read.
// ---------------------------------------------------------------------------
interface MatchRow {
  id: number;
  team_a_id: number;
  team_b_id: number;
  underdog_team_id: number | null;
  score_a: number | null;
  score_b: number | null;
  stage: Stage;
  et_score_a: number | null;
  et_score_b: number | null;
  pen_winner_team_id: number | null;
}

interface PredRow {
  id: number;
  user_id: string;
  score_a: number;
  score_b: number;
  used_2x: boolean;
  pred_et_a: number | null;
  pred_et_b: number | null;
  pred_pen_winner_team_id: number | null;
  prediction_scorers: { player_id: number; is_et: boolean }[];
}

// A computed row for one prediction (what we'd upsert + what we print).
interface Computed {
  prediction_id: number;
  user_id: string;
  username: string;
  match_id: number;
  predFt: string;
  actualFt: string;
  oldTotal: number | null;
  newTotal: number;
  delta: number;
  row: Record<string, unknown>; // the prediction_points upsert payload
}

// ---------------------------------------------------------------------------
// Recompute one match. Mirrors app/admin/actions.ts → recomputeMatch exactly
// (same engine call, same used_2x doubling, same superstar/round-3 wiring),
// but returns the per-prediction rows instead of writing them.
// ---------------------------------------------------------------------------
async function recomputeMatch(
  supabase: SupabaseClient,
  matchId: number,
  round3Ids: Set<number>,
  superstarPlayerIds: number[],
  usernameByUser: Map<string, string>,
  computedAt: string,
): Promise<Computed[]> {
  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select(
      "id, team_a_id, team_b_id, underdog_team_id, score_a, score_b, stage, et_score_a, et_score_b, pen_winner_team_id",
    )
    .eq("id", matchId)
    .single();
  if (matchErr || !match) throw new Error(`Match ${matchId} not found: ${matchErr?.message}`);
  const m = match as MatchRow;
  if (m.score_a === null || m.score_b === null) {
    throw new Error(`Match ${matchId} has no FT score — skip.`);
  }
  const stage = (m.stage as Stage) ?? "group";
  const isRound3 = round3Ids.has(matchId);
  const actualFt = `${m.score_a}-${m.score_b}`;

  // Match goals — one row per goal, split FT vs ET. Chunked.
  const goals = await paged<{ player_id: number; is_own_goal: boolean; is_et: boolean }>(
    (from, to) =>
      supabase
        .from("match_goals")
        .select("player_id, is_own_goal, is_et")
        .eq("match_id", matchId)
        .order("id", { ascending: true })
        .range(from, to),
  );
  const ftGoals: ActualGoal[] = [];
  const etGoals: ActualGoal[] = [];
  for (const g of goals) {
    const goal: ActualGoal = { playerId: g.player_id, isOwnGoal: g.is_own_goal };
    if (g.is_et) etGoals.push(goal);
    else ftGoals.push(goal);
  }

  // Only LOCKED predictions. Chunked.
  const preds = await paged<PredRow>((from, to) =>
    supabase
      .from("predictions")
      .select(
        "id, user_id, score_a, score_b, used_2x, pred_et_a, pred_et_b, pred_pen_winner_team_id, prediction_scorers(player_id, is_et)",
      )
      .eq("match_id", matchId)
      .eq("locked", true)
      .order("id", { ascending: true })
      .range(from, to) as unknown as PromiseLike<{
      data: PredRow[] | null;
      error: { message: string } | null;
    }>,
  );

  // Existing (old) points for this match, to show the delta. Chunked.
  const oldPoints = await paged<{ prediction_id: number; total_pts: number }>((from, to) =>
    supabase
      .from("prediction_points")
      .select("prediction_id, total_pts")
      .eq("match_id", matchId)
      .order("prediction_id", { ascending: true })
      .range(from, to),
  );
  const oldByPred = new Map<number, number>();
  for (const p of oldPoints) oldByPred.set(p.prediction_id, p.total_pts);

  const out: Computed[] = [];
  for (const p of preds) {
    const scorers = p.prediction_scorers ?? [];
    const ftPicks = scorers.filter((s) => !s.is_et).map((s) => s.player_id);
    const etPicks = scorers.filter((s) => s.is_et).map((s) => s.player_id);

    const res = scorePrediction({
      stage,
      predScoreA: p.score_a,
      predScoreB: p.score_b,
      predictedScorerIds: ftPicks,
      actualScoreA: m.score_a as number,
      actualScoreB: m.score_b as number,
      actualGoals: ftGoals,
      teamAId: m.team_a_id,
      teamBId: m.team_b_id,
      underdogTeamId: m.underdog_team_id ?? null,
      isRound3,
      superstarPlayerIds,
      etScoreA: m.et_score_a ?? undefined,
      etScoreB: m.et_score_b ?? undefined,
      penWinnerTeamId: m.pen_winner_team_id ?? null,
      predEtA: p.pred_et_a ?? undefined,
      predEtB: p.pred_et_b ?? undefined,
      predPenWinnerTeamId: p.pred_pen_winner_team_id ?? null,
      predictedScorerIdsEt: etPicks,
      actualGoalsEt: etGoals,
    });

    // used_2x doubling — applied HERE, exactly as the admin recompute layer does
    // (only total_pts doubles, negatives included; component columns stay RAW).
    const used2x = p.used_2x ?? false;
    const newTotal = used2x ? res.totalPts * 2 : res.totalPts;
    const oldTotal = oldByPred.has(p.id) ? (oldByPred.get(p.id) as number) : null;

    out.push({
      prediction_id: p.id,
      user_id: p.user_id,
      username: usernameByUser.get(p.user_id) ?? p.user_id.slice(0, 8),
      match_id: matchId,
      predFt: `${p.score_a}-${p.score_b}`,
      actualFt,
      oldTotal,
      newTotal,
      delta: newTotal - (oldTotal ?? 0),
      row: {
        prediction_id: p.id,
        user_id: p.user_id,
        match_id: matchId,
        winner_pts: res.winnerPts,
        gd_pts: res.gdPts,
        exact_pts: res.exactPts,
        scorer_pts: res.scorerPts,
        underdog_pts: res.underdogPts,
        total_pts: newTotal,
        got_winner: res.gotWinner,
        got_gd: res.gotGd,
        got_exact: res.gotExact,
        correct_scorers: res.correctScorers,
        got_underdog: res.gotUnderdog,
        computed_at: computedAt,
      },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pretty per-user table + delta summary.
// ---------------------------------------------------------------------------
function printTable(rows: Computed[], header: string): void {
  console.log("\n" + header);
  const cols = [
    ["user", 18],
    ["match", 6],
    ["predFT", 7],
    ["actFT", 7],
    ["old", 5],
    ["new", 5],
    ["delta", 6],
  ] as const;
  const line = cols.map(([h, w]) => String(h).padEnd(w)).join(" ");
  console.log(line);
  console.log("-".repeat(line.length));
  const sorted = [...rows].sort(
    (a, b) => a.match_id - b.match_id || a.username.localeCompare(b.username),
  );
  for (const r of sorted) {
    console.log(
      [
        r.username.slice(0, 18).padEnd(18),
        String(r.match_id).padEnd(6),
        r.predFt.padEnd(7),
        r.actualFt.padEnd(7),
        String(r.oldTotal ?? "—").padEnd(5),
        String(r.newTotal).padEnd(5),
        (r.delta >= 0 ? "+" + r.delta : String(r.delta)).padEnd(6),
      ].join(" "),
    );
  }
}

function printSummary(rows: Computed[]): void {
  const byUser = new Map<string, { username: string; delta: number; matches: number }>();
  for (const r of rows) {
    const cur = byUser.get(r.user_id) ?? { username: r.username, delta: 0, matches: 0 };
    cur.delta += r.delta;
    cur.matches += 1;
    byUser.set(r.user_id, cur);
  }
  const summary = [...byUser.values()].sort(
    (a, b) => b.delta - a.delta || a.username.localeCompare(b.username),
  );
  console.log("\nPER-USER TOTAL DELTA (across all target matches, desc):");
  console.log("user".padEnd(18), "matches".padEnd(8), "totalDelta");
  console.log("-".repeat(40));
  for (const s of summary) {
    console.log(
      s.username.slice(0, 18).padEnd(18),
      String(s.matches).padEnd(8),
      (s.delta >= 0 ? "+" + s.delta : String(s.delta)),
    );
  }
  const sumAll = rows.reduce((acc, r) => acc + r.delta, 0);
  console.log("\nSUM OF ALL DELTAS: " + (sumAll >= 0 ? "+" + sumAll : String(sumAll)));
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  loadEnvLocal();

  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const dryRun = !commit; // DEFAULT: dry-run.
  const matchArg = args.find((a) => a.startsWith("--match="));
  let matchIds = TARGET_MATCH_IDS;
  if (matchArg) {
    const id = Number(matchArg.split("=")[1]);
    if (!TARGET_MATCH_IDS.includes(id)) {
      throw new Error(`--match=${id} is not one of the target ids ${TARGET_MATCH_IDS.join(", ")}.`);
    }
    matchIds = [id];
  }

  console.log(`Mode: ${dryRun ? "DRY-RUN (no writes)" : "COMMIT (will upsert prediction_points)"}`);
  console.log(`Target matches: ${matchIds.join(", ")}`);

  const supabase = await makeClient();
  const computedAt = new Date().toISOString();

  // Round-3 set (from ALL matches) + superstar ids + username lookup — loaded once, chunked.
  const allMatches = await paged<{
    id: number;
    team_a_id: number;
    team_b_id: number;
    kickoff_at: string;
  }>((from, to) =>
    supabase
      .from("matches")
      .select("id, team_a_id, team_b_id, kickoff_at")
      .order("id", { ascending: true })
      .range(from, to),
  );
  const round3Ids = computeRound3MatchIds(allMatches);

  const superstars = await paged<{ id: number }>((from, to) =>
    supabase
      .from("players")
      .select("id")
      .eq("is_superstar", true)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const superstarPlayerIds = superstars.map((s) => s.id);

  const profiles = await paged<{ id: string; username: string }>((from, to) =>
    supabase
      .from("profiles")
      .select("id, username")
      .order("id", { ascending: true })
      .range(from, to),
  );
  const usernameByUser = new Map<string, string>();
  for (const p of profiles) usernameByUser.set(p.id, p.username);

  // Compute all matches.
  const all: Computed[] = [];
  for (const matchId of matchIds) {
    const rows = await recomputeMatch(
      supabase,
      matchId,
      round3Ids,
      superstarPlayerIds,
      usernameByUser,
      computedAt,
    );
    all.push(...rows);
  }

  if (all.length === 0) {
    console.log("\nNo locked predictions found for the target matches. Nothing to do.");
    return;
  }

  printTable(all, dryRun ? "DRY-RUN — computed (nothing written):" : "COMPUTED (to write):");

  if (commit) {
    // Upsert keyed on prediction_id (the PK). Idempotent — re-running writes the
    // same values, so a second run yields all-zero deltas.
    const payload = all.map((c) => c.row);
    for (let i = 0; i < payload.length; i += PAGE) {
      const slice = payload.slice(i, i + PAGE);
      const { error } = await supabase
        .from("prediction_points")
        .upsert(slice, { onConflict: "prediction_id" });
      if (error) throw new Error(`Upsert failed: ${error.message}`);
    }
    console.log(`\nCOMMITTED: upserted ${payload.length} prediction_points rows (computed_at=${computedAt}).`);
    printTable(all, "WRITTEN:");
  }

  printSummary(all);

  if (dryRun) {
    console.log("\nThis was a DRY-RUN. Re-run with `-- --commit` to write these rows.");
  }
}

main().catch((e) => {
  console.error("\nERROR:", (e as Error).message);
  process.exit(1);
});
