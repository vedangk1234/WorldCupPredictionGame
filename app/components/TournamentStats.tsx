import { createClient } from "@/lib/supabase/server";

// ─────────────────────────────────────────────────────────────────────────────
// Tournament in Numbers — the post-tournament home page. Every stat is read from
// a pre-built Supabase view (all granted to authenticated); this component only
// reads, slices and presents. Dependency-free — the ONE chart is plain CSS bars.
// Every card guards for empty data ("—") and every division is guarded, so a
// view returning no rows (or an unexpected shape) degrades gracefully instead of
// breaking the page.
// ─────────────────────────────────────────────────────────────────────────────

// Sharpest-predictor minimum sample size (see card 7).
const MIN_ACCURACY_MATCHES = 20;

// Loose row type — the views are defined in Supabase, not in the repo, so we read
// fields defensively rather than binding to a strict shape.
type Row = Record<string, unknown>;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === "true" || v === "t";
}

// Best-effort accessors for identity / team / scoreline fields that may vary in
// name across views.
function pName(r: Row): string {
  return str(r.name) ?? str(r.display_name) ?? str(r.full_name) ?? "Player";
}
function pUser(r: Row): string {
  return str(r.username) ?? "";
}
function teamA(r: Row): string {
  return str(r.team_a_name) ?? str(r.team_a) ?? str(r.team_a_code) ?? "Team A";
}
function teamB(r: Row): string {
  return str(r.team_b_name) ?? str(r.team_b) ?? str(r.team_b_code) ?? "Team B";
}
function scoreLine(r: Row): string {
  const a = num(r.score_a);
  const b = num(r.score_b);
  if (a === null || b === null) return "";
  return `${a}–${b}`;
}

// Short IST date label, e.g. "12 Jul".
const dayFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
});
function shortDay(v: unknown): string {
  const raw = str(v) ?? (typeof v === "number" ? String(v) : null);
  if (!raw) return "—";
  const d = new Date(raw.length <= 10 ? `${raw}T00:00:00Z` : raw);
  if (Number.isNaN(d.getTime())) return raw;
  return dayFmt.format(d);
}

export default async function TournamentStats() {
  const supabase = createClient();

  // Load every view in parallel. Potentially-large views (hauls, top players,
  // contrarian exacts) are bounded at the DB with .order().limit(); the rest are
  // small (one row per user / day / match / scoreline) and read whole.
  const [
    headlineRes,
    perUserRes,
    perDayRes,
    winnerStreakRes,
    haulsTopRes,
    haulsBottomRes,
    topScorelinesRes,
    topPlayersRes,
    difficultyEasyRes,
    difficultyHardRes,
    contrarianRes,
    outrightSpecialsRes,
    outrightRarityRes,
  ] = await Promise.all([
    supabase.from("stats_headline").select("*").limit(1),
    supabase.from("stats_per_user").select("*"),
    supabase.from("stats_per_day").select("*"),
    supabase.from("stats_winner_streak").select("*"),
    supabase.from("stats_match_hauls").select("*").order("total_pts", { ascending: false }).limit(3),
    supabase.from("stats_match_hauls").select("*").order("total_pts", { ascending: true }).limit(3),
    supabase.from("stats_top_scorelines").select("*"),
    supabase.from("stats_top_players").select("*").order("times_backed", { ascending: false }).limit(10),
    supabase.from("stats_match_difficulty").select("*").order("avg_pts", { ascending: false }).limit(1),
    supabase.from("stats_match_difficulty").select("*").order("avg_pts", { ascending: true }).limit(1),
    supabase
      .from("stats_contrarian_exacts")
      .select("*")
      .order("others_with_same_exact", { ascending: true })
      .limit(8),
    supabase.from("stats_outright_specials").select("*"),
    supabase.from("stats_outright_rarity").select("*"),
  ]);

  const headline = ((headlineRes.data ?? [])[0] ?? null) as Row | null;
  const perUser = (perUserRes.data ?? []) as Row[];
  const perDay = (perDayRes.data ?? []) as Row[];
  const winnerStreak = (winnerStreakRes.data ?? []) as Row[];
  const haulsTop = (haulsTopRes.data ?? []) as Row[];
  const haulsBottom = (haulsBottomRes.data ?? []) as Row[];
  const topScorelines = (topScorelinesRes.data ?? []) as Row[];
  const topPlayers = (topPlayersRes.data ?? []) as Row[];
  const easiest = ((difficultyEasyRes.data ?? [])[0] ?? null) as Row | null;
  const hardest = ((difficultyHardRes.data ?? [])[0] ?? null) as Row | null;
  const contrarian = (contrarianRes.data ?? []) as Row[];
  const outrightSpecials = (outrightSpecialsRes.data ?? []) as Row[];
  const outrightRarity = (outrightRarityRes.data ?? []) as Row[];

  // ── Derived slices from stats_per_user (one row per user; small) ───────────
  const byMatchesDesc = [...perUser].sort(
    (a, b) => (num(b.matches_predicted) ?? 0) - (num(a.matches_predicted) ?? 0),
  );
  const byMatchesAsc = [...perUser].sort(
    (a, b) => (num(a.matches_predicted) ?? 0) - (num(b.matches_predicted) ?? 0),
  );
  const maxLocked = perUser.reduce((m, r) => Math.max(m, num(r.matches_predicted) ?? 0), 0);
  const perfectAttendance =
    maxLocked > 0 ? perUser.filter((r) => (num(r.matches_predicted) ?? 0) === maxLocked) : [];

  const byExacts = [...perUser].sort((a, b) => (num(b.exacts) ?? 0) - (num(a.exacts) ?? 0));

  const sharpest = perUser
    .filter((r) => (num(r.matches_predicted) ?? 0) >= MIN_ACCURACY_MATCHES)
    .sort((a, b) => (num(b.points_per_match) ?? 0) - (num(a.points_per_match) ?? 0))
    .slice(0, 3);

  const coldTakes = [...perUser]
    .sort((a, b) => (num(b.zero_or_neg_matches) ?? 0) - (num(a.zero_or_neg_matches) ?? 0))
    .slice(0, 3);

  const drawCallers = [...perUser]
    .sort((a, b) => (num(b.draws_predicted) ?? 0) - (num(a.draws_predicted) ?? 0))
    .slice(0, 3);

  const superstarGamblers = [...perUser]
    .sort((a, b) => (num(b.superstar_picks) ?? 0) - (num(a.superstar_picks) ?? 0))
    .slice(0, 3);

  const withGoals = perUser.filter((r) => num(r.avg_pred_goals) !== null);
  const optimist =
    withGoals.length > 0
      ? [...withGoals].sort((a, b) => (num(b.avg_pred_goals) ?? 0) - (num(a.avg_pred_goals) ?? 0))[0]
      : null;
  const pessimist =
    withGoals.length > 0
      ? [...withGoals].sort((a, b) => (num(a.avg_pred_goals) ?? 0) - (num(b.avg_pred_goals) ?? 0))[0]
      : null;

  const streakLeaders = [...winnerStreak]
    .sort((a, b) => (num(b.longest_winner_streak) ?? 0) - (num(a.longest_winner_streak) ?? 0))
    .slice(0, 3);

  const scorelines = [...topScorelines]
    .sort((a, b) => (num(b.times_predicted) ?? 0) - (num(a.times_predicted) ?? 0))
    .slice(0, 5);

  // ── Outright specials ──────────────────────────────────────────────────────
  // The per-category pick COUNTS live on stats_outright_rarity (one wide row of
  // got_*_n columns), not on stats_outright_specials (one row per user).
  const rarity = (outrightRarity[0] ?? null) as Row | null;
  const champWinners = outrightSpecials.filter((r) => truthy(r.got_champion));
  const champN = num(rarity?.got_champion_n) ?? champWinners.length;
  const bootWinners = outrightSpecials.filter((r) => truthy(r.got_boot_goals));
  const bootN = num(rarity?.got_boot_goals_n) ?? bootWinners.length;
  const ballN = num(rarity?.got_ball_n) ?? 0;

  // "Lonely correct": the correct outright category with the fewest (>0) pickers,
  // built from the rarity row's got_*_n counts.
  const rarityRows = (rarity
    ? [
        { label: "the champion", count: num(rarity.got_champion_n) },
        { label: "the runner-up", count: num(rarity.got_runner_up_n) },
        { label: "third place", count: num(rarity.got_third_n) },
        { label: "the Golden Boot winner", count: num(rarity.got_boot_n) },
        { label: "the Golden Glove winner", count: num(rarity.got_glove_n) },
        { label: "the exact Boot goals", count: num(rarity.got_boot_goals_n) },
        { label: "the Golden Ball", count: num(rarity.got_ball_n) },
      ]
    : []
  ).filter((r) => r.count !== null && (r.count ?? 0) > 0) as {
    label: string;
    count: number;
  }[];
  const lonely =
    rarityRows.length > 0
      ? [...rarityRows].sort((a, b) => a.count - b.count)[0]
      : null;

  const perDaySorted = [...perDay].sort(
    (a, b) => new Date(shortDayKey(a)).getTime() - new Date(shortDayKey(b)).getTime(),
  );
  const maxPerDay = perDaySorted.reduce((m, r) => Math.max(m, num(r.predictions) ?? 0), 0);

  function shortDayKey(r: Row): string {
    const raw = str(r.day) ?? str(r.date) ?? str(r.d) ?? "";
    return raw.length <= 10 && raw ? `${raw}T00:00:00Z` : raw || "1970-01-01";
  }
  function dayValue(r: Row): unknown {
    return r.day ?? r.date ?? r.d;
  }

  return (
    <>
      <ChampionBanner />

      <div className="stripe-26" style={{ borderRadius: 99, marginBottom: 18, maxWidth: 120 }} />
      <p style={eyebrow}>FIFA WORLD CUP 2026 · THE STORY IN DATA</p>
      <h1 className="display" style={{ fontSize: 38, lineHeight: 1.05, margin: "8px 0 6px" }}>
        📊 Tournament in Numbers
      </h1>
      <p style={{ color: "var(--chalk-dim)", fontSize: 14, lineHeight: 1.6, margin: "0 0 26px", maxWidth: 620 }}>
        The whole competition, told through everyone&apos;s predictions — who showed up, who called
        it, and who kept the faith long after the odds said otherwise.
      </p>

      {/* 1 — HEADLINE BAND */}
      <div style={bandStyle}>
        <BandStat value={num(headline?.total_predictions)} label="predictions made" />
        <BandStat value={num(headline?.total_players)} label="players" />
        <BandStat value={num(headline?.total_scorer_picks)} label="scorers backed" />
      </div>

      <div style={gridStyle}>
        {/* 2 — MOST PREDICTIONS */}
        <Card title="Most predictions" caption="matches locked in">
          <LeaderList rows={byMatchesDesc.slice(0, 5)} pick={(r) => num(r.matches_predicted)} />
        </Card>

        {/* 3 — FEWEST PREDICTIONS */}
        <Card title="Fewest predictions" caption="…but still showed up">
          <LeaderList rows={byMatchesAsc.slice(0, 5)} pick={(r) => num(r.matches_predicted)} />
        </Card>

        {/* 4 — PERFECT ATTENDANCE */}
        <Card title="Perfect attendance" caption={maxLocked > 0 ? `${maxLocked} / ${maxLocked} — never missed one` : undefined}>
          {perfectAttendance.length === 0 ? (
            <Empty />
          ) : (
            <ul style={plainList}>
              {perfectAttendance.map((r, i) => (
                <li key={i} style={nameRow}>
                  <span>✅ {nameSpan(r)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 6 — CHAMPION OF EXACTS */}
        <Card title="Champion of exacts" caption="exact scorelines nailed">
          <LeaderList rows={byExacts.slice(0, 5)} pick={(r) => num(r.exacts)} />
        </Card>

        {/* 7 — SHARPEST PREDICTOR */}
        <Card title="Sharpest predictor" caption={`points per match (min ${MIN_ACCURACY_MATCHES} predictions)`}>
          <LeaderList rows={sharpest} pick={(r) => num(r.points_per_match)} decimals={2} />
        </Card>

        {/* 8 — LONGEST WINNER STREAK */}
        <Card title="Longest winner streak" caption="correct winners in a row">
          <LeaderList rows={streakLeaders} pick={(r) => num(r.longest_winner_streak)} />
        </Card>

        {/* 9 — COLD TAKES */}
        <Card title="Cold takes 🥶" caption="matches that scored 0 or less">
          <LeaderList rows={coldTakes} pick={(r) => num(r.zero_or_neg_matches)} />
        </Card>

        {/* 10 — BIGGEST SINGLE-MATCH HAUL */}
        <Card title="Biggest single-match haul" caption="most points from one match">
          <HaulList rows={haulsTop} />
        </Card>

        {/* 11 — WORST SINGLE MATCH */}
        <Card title="Worst single match" caption="the one to forget">
          <HaulList rows={haulsBottom} negative />
        </Card>

        {/* 12 — MOST-PREDICTED SCORELINE */}
        <Card title="Most-predicted scoreline" caption="everyone's favourite line">
          {scorelines.length === 0 ? (
            <Empty />
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                <span className="display tnum" style={{ fontSize: 40, color: "var(--gold-300)", fontWeight: 800 }}>
                  {str(scorelines[0].scoreline) ?? scoreLine(scorelines[0])}
                </span>
                <span className="tnum" style={{ color: "var(--chalk-dim)", fontSize: 13 }}>
                  ×{num(scorelines[0].times_predicted) ?? 0}
                </span>
              </div>
              <ul style={plainList}>
                {scorelines.slice(1).map((r, i) => (
                  <li key={i} style={nameRow}>
                    <span className="tnum" style={{ fontWeight: 600 }}>{str(r.scoreline) ?? scoreLine(r)}</span>
                    <span className="tnum" style={{ color: "var(--chalk-dim)" }}>
                      ×{num(r.times_predicted) ?? 0}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* 13 — GOLDEN BOY */}
        <Card title="Golden Boy" caption="times backed to score">
          {topPlayers.length === 0 ? (
            <Empty />
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                <span className="display" style={{ fontSize: 22, fontWeight: 800 }}>
                  {str(topPlayers[0].player) ?? "Player"}
                  {str(topPlayers[0].team) && (
                    <span style={{ fontSize: 13, color: "var(--chalk-dim)", fontWeight: 600 }}>
                      {" "}— {str(topPlayers[0].team)}
                    </span>
                  )}
                </span>
                <span className="tnum" style={{ color: "var(--gold-300)", fontWeight: 700 }}>
                  {num(topPlayers[0].times_backed) ?? 0}
                </span>
              </div>
              <ul style={plainList}>
                {topPlayers.slice(1).map((r, i) => (
                  <li key={i} style={nameRow}>
                    <span>
                      <span style={{ color: "var(--chalk-dim)", fontWeight: 700 }}>{i + 2}. </span>
                      {str(r.player) ?? "Player"}
                      {str(r.team) && (
                        <span style={{ color: "var(--chalk-dim)" }}> — {str(r.team)}</span>
                      )}
                    </span>
                    <span className="tnum" style={{ color: "var(--chalk-dim)" }}>
                      {num(r.times_backed) ?? 0}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* 14 — EASIEST vs HARDEST MATCH */}
        <Card title="Easiest vs hardest match" caption="average points scored per player">
          {!easiest && !hardest ? (
            <Empty />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {easiest && (
                <div>
                  <p style={miniLabel}>Everyone nailed</p>
                  <p style={{ margin: "2px 0 0", fontWeight: 600 }}>
                    {teamA(easiest)} vs {teamB(easiest)}
                  </p>
                  <p className="tnum" style={{ margin: "2px 0 0", color: "var(--gold-300)", fontWeight: 700 }}>
                    {fmtNum(num(easiest.avg_pts), 2)} pts avg
                  </p>
                </div>
              )}
              {hardest && (
                <div>
                  <p style={miniLabel}>Nobody saw it coming</p>
                  <p style={{ margin: "2px 0 0", fontWeight: 600 }}>
                    {teamA(hardest)} vs {teamB(hardest)}
                  </p>
                  <p className="tnum" style={{ margin: "2px 0 0", color: "var(--m3)", fontWeight: 700 }}>
                    {fmtNum(num(hardest.avg_pts), 2)} pts avg
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* 17 — OPTIMIST vs PESSIMIST */}
        <Card title="Optimist vs pessimist" caption="average goals per predicted scoreline">
          {!optimist && !pessimist ? (
            <Empty />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {optimist && (
                <div>
                  <p style={miniLabel}>☀️ The optimist</p>
                  <p style={{ margin: "2px 0 0", fontWeight: 600 }}>{nameSpan(optimist)}</p>
                  <p className="tnum" style={{ margin: "2px 0 0", color: "var(--gold-300)", fontWeight: 700 }}>
                    {fmtNum(num(optimist.avg_pred_goals), 2)} goals / match
                  </p>
                </div>
              )}
              {pessimist && (
                <div>
                  <p style={miniLabel}>🌧️ The pessimist</p>
                  <p style={{ margin: "2px 0 0", fontWeight: 600 }}>{nameSpan(pessimist)}</p>
                  <p className="tnum" style={{ margin: "2px 0 0", color: "var(--chalk-dim)", fontWeight: 700 }}>
                    {fmtNum(num(pessimist.avg_pred_goals), 2)} goals / match
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* 18 — DRAW-CALLER */}
        <Card title="Draw-caller" caption="predicted the stalemates">
          {drawCallers.length === 0 ? (
            <Empty />
          ) : (
            <ul style={plainList}>
              {drawCallers.map((r, i) => (
                <li key={i} style={nameRow}>
                  <span>
                    <span style={{ color: "var(--chalk-dim)", fontWeight: 700 }}>{i + 1}. </span>
                    {nameSpan(r)}
                  </span>
                  <span className="tnum" style={{ color: "var(--chalk-dim)" }}>
                    {num(r.draws_hit) ?? 0} of {num(r.draws_predicted) ?? 0} right
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 19 — SUPERSTAR GAMBLER */}
        <Card title="Superstar gambler ⭐" caption="each starred pick is a ±3 gamble — these are picks, not net points">
          <LeaderList
            rows={superstarGamblers}
            pick={(r) => num(r.superstar_picks)}
            unit="picks"
          />
        </Card>

        {/* 16 — OUTRIGHT SPECIALS */}
        <Card title="Outright specials" caption="the season-long calls">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <p style={miniLabel}>🏆 Called the champion (Spain){champN ? ` — ${champN}` : ""}</p>
              <p style={{ margin: "3px 0 0", fontSize: 13.5, color: "var(--chalk)" }}>
                {champWinners.length > 0 ? champWinners.map(pUser).filter(Boolean).join(", ") : "—"}
              </p>
            </div>
            <div>
              <p style={miniLabel}>🥅 Boot-goals exact-10 club{bootN ? ` — ${bootN}` : ""}</p>
              <p style={{ margin: "3px 0 0", fontSize: 13.5, color: "var(--chalk)" }}>
                {bootWinners.length > 0 ? bootWinners.map(pUser).filter(Boolean).join(", ") : "—"}
              </p>
            </div>
            {lonely && (
              <div>
                <p style={miniLabel}>🎯 Lonely correct</p>
                <p style={{ margin: "3px 0 0", fontSize: 13.5, color: "var(--chalk)" }}>
                  Only {lonely.count} nailed {lonely.label}
                </p>
              </div>
            )}
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--chalk-dim)", lineHeight: 1.55 }}>
              Nobody got the Golden Ball — Rodri was the curveball ({ballN} correct).
            </p>
          </div>
        </Card>

        {/* 15 — MOST CONTRARIAN CALL (wide) */}
        <Card title="Most contrarian call" caption="the exact scorelines almost nobody else saw" wide>
          {contrarian.length === 0 ? (
            <Empty />
          ) : (
            <ul style={plainList}>
              {contrarian.map((r, i) => {
                const others = num(r.others_with_same_exact) ?? 0;
                const solo = others === 1;
                return (
                  <li key={i} style={{ ...nameRow, alignItems: "flex-start" }}>
                    <span>
                      <span style={{ fontWeight: 600 }}>{nameSpan(r)}</span>
                      <span style={{ color: "var(--chalk-dim)" }}>
                        {" "}
                        — {teamA(r)} <span className="tnum">{scoreLine(r)}</span> {teamB(r)}
                      </span>
                    </span>
                    <span
                      className="tnum"
                      style={{
                        color: solo ? "var(--gold-300)" : "var(--chalk-dim)",
                        fontWeight: solo ? 700 : 400,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {solo ? "the ONLY one" : `${others} others`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* 5 — PREDICTIONS PER DAY (the one chart, wide) */}
        <Card title="Predictions per day" caption="how the picks rolled in" wide>
          {perDaySorted.length === 0 || maxPerDay === 0 ? (
            <Empty />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {perDaySorted.map((r, i) => {
                const v = num(r.predictions) ?? 0;
                const pct = maxPerDay > 0 ? Math.max(2, Math.round((v / maxPerDay) * 100)) : 0;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      className="tnum"
                      style={{ width: 52, flexShrink: 0, fontSize: 12, color: "var(--chalk-dim)", textAlign: "right" }}
                    >
                      {shortDay(dayValue(r))}
                    </span>
                    <div style={{ flex: 1, background: "var(--pitch-800)", borderRadius: 6, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: 16,
                          background: "linear-gradient(90deg, var(--pitch-500), var(--gold-400))",
                          borderRadius: 6,
                        }}
                      />
                    </div>
                    <span className="tnum" style={{ width: 40, flexShrink: 0, fontSize: 12.5, fontWeight: 700 }}>
                      {v}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

// ── Presentational helpers ───────────────────────────────────────────────────

// Champion crowning banner — the tournament is over and frozen, so the winner
// and podium are hardcoded from the final standings (no query).
function ChampionBanner() {
  const podium = [
    { medal: "🥇", user: "mm_2605", pts: 495 },
    { medal: "🥈", user: "pranavsai99", pts: 486 },
    { medal: "🥉", user: "ouroboros", pts: 483 },
  ];
  return (
    <div style={{ marginBottom: 26 }}>
      <div
        style={{
          background:
            "linear-gradient(160deg, rgba(212,175,55,0.18), rgba(10,35,22,0.55)), var(--pitch-900)",
          border: "1px solid var(--gold-400)",
          borderRadius: 18,
          padding: "26px 22px",
          textAlign: "center",
          boxShadow: "0 0 40px rgba(212,175,55,0.12)",
        }}
      >
        <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 6 }}>🏆</div>
        <p
          style={{
            ...eyebrow,
            color: "var(--gold-300)",
            fontSize: 12,
            letterSpacing: "0.28em",
          }}
        >
          Champion
        </p>
        <div
          className="display"
          style={{
            fontSize: 46,
            lineHeight: 1.05,
            fontWeight: 800,
            margin: "8px 0 2px",
            color: "var(--gold-300)",
          }}
        >
          mm_2605
        </div>
        <div
          className="display tnum"
          style={{ fontSize: 20, fontWeight: 700, color: "var(--chalk)" }}
        >
          495 <span style={{ fontSize: 14, color: "var(--chalk-dim)", fontWeight: 600 }}>points</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "10px 22px",
          marginTop: 12,
          fontSize: 14,
        }}
      >
        {podium.map((p) => (
          <span key={p.user} style={{ whiteSpace: "nowrap" }}>
            {p.medal} <span style={{ fontWeight: 600 }}>{p.user}</span>{" "}
            <span className="tnum" style={{ color: "var(--gold-300)", fontWeight: 700 }}>
              {p.pts}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function fmtNum(v: number | null, decimals = 0): string {
  if (v === null) return "—";
  return decimals > 0 ? v.toFixed(decimals) : String(v);
}

function nameSpan(r: Row) {
  const u = pUser(r);
  return (
    <>
      <span style={{ fontWeight: 600 }}>{pName(r)}</span>
      {u && <span style={{ color: "var(--chalk-dim)", fontWeight: 400 }}> ({u})</span>}
    </>
  );
}

function Empty() {
  return <p style={{ margin: 0, color: "var(--chalk-dim)", fontSize: 22, fontWeight: 700 }}>—</p>;
}

function Card({
  title,
  caption,
  wide,
  children,
}: {
  title: string;
  caption?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        gridColumn: wide ? "1 / -1" : undefined,
        background: "var(--pitch-900)",
        border: "1px solid var(--pitch-line)",
        borderRadius: 14,
        padding: 18,
      }}
    >
      <p style={eyebrow}>{title}</p>
      {caption && (
        <p style={{ margin: "2px 0 12px", fontSize: 12.5, color: "var(--chalk-dim)", lineHeight: 1.5 }}>
          {caption}
        </p>
      )}
      {!caption && <div style={{ height: 12 }} />}
      {children}
    </section>
  );
}

// Big-number band cell (headline).
function BandStat({ value, label }: { value: number | null; label: string }) {
  return (
    <div style={{ flex: "1 1 120px", textAlign: "center" }}>
      <div className="display tnum" style={{ fontSize: 40, fontWeight: 800, color: "var(--gold-300)", lineHeight: 1 }}>
        {value === null ? "—" : value.toLocaleString("en-IN")}
      </div>
      <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--chalk-dim)", letterSpacing: "0.02em" }}>
        {label}
      </div>
    </div>
  );
}

// A ranked user list: leader emphasised, the rest listed. `pick` extracts the
// metric; `decimals`/`unit` format the value.
function LeaderList({
  rows,
  pick,
  decimals = 0,
  unit,
}: {
  rows: Row[];
  pick: (r: Row) => number | null;
  decimals?: number;
  unit?: string;
}) {
  if (rows.length === 0) return <Empty />;
  const suffix = unit ? ` ${unit}` : "";
  const [leader, ...rest] = rows;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 15 }}>{nameSpan(leader)}</span>
        <span className="display tnum" style={{ fontSize: 24, fontWeight: 800, color: "var(--gold-300)" }}>
          {fmtNum(pick(leader), decimals)}
          {unit && <span style={{ fontSize: 12, color: "var(--chalk-dim)", fontWeight: 600 }}>{suffix}</span>}
        </span>
      </div>
      {rest.length > 0 && (
        <ul style={{ ...plainList, marginTop: 10 }}>
          {rest.map((r, i) => (
            <li key={i} style={nameRow}>
              <span>
                <span style={{ color: "var(--chalk-dim)", fontWeight: 700 }}>{i + 2}. </span>
                {nameSpan(r)}
              </span>
              <span className="tnum" style={{ color: "var(--chalk-dim)", fontWeight: 600 }}>
                {fmtNum(pick(r), decimals)}
                {suffix}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Single-match haul rows (biggest / worst).
function HaulList({ rows, negative }: { rows: Row[]; negative?: boolean }) {
  if (rows.length === 0) return <Empty />;
  return (
    <ul style={plainList}>
      {rows.map((r, i) => {
        const pts = num(r.total_pts);
        const isNeg = (pts ?? 0) < 0;
        return (
          <li key={i} style={{ ...nameRow, alignItems: "flex-start" }}>
            <span>
              <span style={{ fontWeight: 600 }}>{nameSpan(r)}</span>
              <span style={{ display: "block", color: "var(--chalk-dim)", fontSize: 12.5, marginTop: 2 }}>
                {teamA(r)} <span className="tnum">{scoreLine(r)}</span> {teamB(r)}
                {truthy(r.used_2x) && (
                  <span style={{ color: "var(--gold-300)", fontWeight: 700 }}> ⚡2x</span>
                )}
              </span>
            </span>
            <span
              className="display tnum"
              style={{
                fontSize: 22,
                fontWeight: 800,
                whiteSpace: "nowrap",
                color: negative || isNeg ? "var(--m3)" : "var(--gold-300)",
              }}
            >
              {pts === null ? "—" : pts}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Style tokens ─────────────────────────────────────────────────────────────

const eyebrow: React.CSSProperties = {
  color: "var(--gold-400)",
  letterSpacing: "0.14em",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  margin: 0,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 14,
};

const bandStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 18,
  alignItems: "center",
  justifyContent: "space-around",
  background:
    "linear-gradient(180deg, rgba(31,164,99,0.10), rgba(10,35,22,0.6)), var(--pitch-900)",
  border: "1px solid var(--pitch-line)",
  borderRadius: 16,
  padding: "22px 18px",
  marginBottom: 20,
};

const plainList: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const nameRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 13.5,
};

const miniLabel: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 700,
  color: "var(--gold-400)",
  letterSpacing: "0.02em",
};
