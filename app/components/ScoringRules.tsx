// "How scoring works" — the collapsible rules box. Single source of truth shared
// by the home page and (historically) the group-stage page. Display only; the
// rules text mirrors the scoring engine but does not drive it.
export default function ScoringRules() {
  return (
    <details className="rules-banner" open>
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 700,
          fontSize: 14,
          color: "var(--chalk)",
          listStyle: "none",
        }}
      >
        ⚽ How scoring works
      </summary>
      <ul
        style={{
          margin: "10px 0 0",
          padding: "0 0 0 2px",
          listStyle: "none",
          color: "var(--chalk-dim)",
          fontSize: 13,
          lineHeight: 1.7,
        }}
      >
        <li>
          <strong style={{ color: "var(--gold-300)" }}>Exact scoreline +5</strong> — you
          predicted the precise final score.
        </li>
        <li>
          <strong style={{ color: "var(--gold-300)" }}>Correct match winner +3</strong> — you
          picked the right team to win, or correctly called a draw.
        </li>
        <li>
          <strong style={{ color: "var(--gold-300)" }}>Correct goal difference +1</strong> —
          you got the winning margin right (e.g. a win by 2). A correctly predicted draw counts
          here too.
        </li>
        <li>
          <strong style={{ color: "var(--gold-300)" }}>Each correct goal scorer +2 per goal</strong>{" "}
          — for every player you name who actually scores, you get +2 for each goal they score (a
          brace = +4).
        </li>
        <li>
          <strong style={{ color: "var(--gold-300)" }}>Predicted scorer scores an own goal −1</strong>{" "}
          — if a player you backed to score puts it into their own net instead, you lose 1 point
          for that pick.
        </li>
        <li>
          <strong style={{ color: "var(--gold-300)" }}>Underdog win +5</strong> — some matches
          have a designated ⚡ underdog (the team less expected to win). If you back that underdog
          and they actually win, you earn +5 on top of your other points. No bonus if they draw
          or lose, and matches with no ⚡ tag have no underdog.
        </li>
        <li>
          <strong style={{ color: "var(--gold-300)" }}>Lock before kickoff</strong> — you must
          lock your prediction before the match starts. An unlocked prediction doesn&apos;t
          count — 0 points for that match.
        </li>
      </ul>

      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px solid var(--pitch-line)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--gold-300)" }}>
          ⚔ Knockouts (Third-place match, Semi-finals, Quarter-finals, Round of 16 &amp; Round of 32)
        </div>
        <ul
          style={{
            margin: "8px 0 0",
            padding: "0 0 0 2px",
            listStyle: "none",
            color: "var(--chalk-dim)",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <li>
            All the normal full-time scoring above still applies to the 90-minute result.
          </li>
          <li>
            <strong style={{ color: "var(--gold-300)" }}>Predict a draw → extra time</strong> — if
            you predict a level full-time score, you also predict the <strong>total</strong> score
            after extra time. It earns its own winner&nbsp;(+3), exact&nbsp;(+5) and goal
            difference&nbsp;(+1), same as full time.
          </li>
          <li>
            <strong style={{ color: "var(--gold-300)" }}>Extra-time scorers</strong> — you can only
            name extra-time scorers for the goals you <em>add</em> in extra time (+2 per ET goal). No
            added goals, no ET scorers.
          </li>
          <li>
            <strong style={{ color: "var(--gold-300)" }}>Penalties +5</strong> — if you predict the
            tie still level after extra time, pick the shoot-out winner. +5 if you get it right.
          </li>
          <li>
            <strong style={{ color: "var(--gold-300)" }}>⭐ Superstars score anywhere</strong> — in a
            knockout the superstar ±3 applies if your starred pick scores <em>anywhere</em> in the
            match (full-time or extra time).
          </li>
        </ul>
      </div>
    </details>
  );
}
