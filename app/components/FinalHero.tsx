"use client";

import { useEffect, useState } from "react";

// The World Cup Final hero: eyebrow pill, big "FINAL" wordmark, the two team
// rondels with a "VS", and a live countdown to kickoff. Display only — it reads
// the real match teams + kickoff instant and never touches predictions/scoring.
interface Props {
  teamAName: string;
  teamBName: string;
  kickoffAt: string; // ISO instant
}

interface Remaining {
  days: number;
  hrs: number;
  mins: number;
  secs: number;
}

function remaining(target: number, now: number): Remaining {
  let diff = Math.max(0, Math.floor((target - now) / 1000));
  const days = Math.floor(diff / 86400);
  diff -= days * 86400;
  const hrs = Math.floor(diff / 3600);
  diff -= hrs * 3600;
  const mins = Math.floor(diff / 60);
  const secs = diff - mins * 60;
  return { days, hrs, mins, secs };
}

const pad = (n: number) => String(n).padStart(2, "0");

export default function FinalHero({ teamAName, teamBName, kickoffAt }: Props) {
  const target = new Date(kickoffAt).getTime();
  // Start null so server + first client render match (avoids hydration mismatch),
  // then tick once mounted.
  const [rem, setRem] = useState<Remaining | null>(null);

  useEffect(() => {
    const tick = () => setRem(remaining(target, Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  const cells: { num: string; lbl: string }[] = [
    { num: rem ? pad(rem.days) : "—", lbl: "Days" },
    { num: rem ? pad(rem.hrs) : "—", lbl: "Hrs" },
    { num: rem ? pad(rem.mins) : "—", lbl: "Min" },
    { num: rem ? pad(rem.secs) : "—", lbl: "Sec" },
  ];

  return (
    <section className="final-hero">
      <div className="final-eyebrow">
        <span className="dot" />
        FIFA World Cup 2026
      </div>
      <h1 className="final-anton final-title">Final</h1>
      <p className="final-sub">
        One match. One trophy. Lock your call before kickoff — the whole group sees it the moment you
        do.
      </p>

      <div className="final-teams">
        <div className="final-team">
          <div className="final-rondel es" />
          <div className="final-anton final-team-name">{teamAName}</div>
        </div>
        <div className="final-anton final-vs">VS</div>
        <div className="final-team">
          <div className="final-rondel ar">
            <span className="sun" />
          </div>
          <div className="final-anton final-team-name">{teamBName}</div>
        </div>
      </div>

      <div className="final-countdown tnum" role="timer" aria-label="Time until kickoff">
        {cells.map((c) => (
          <div key={c.lbl} className="final-cd-cell">
            <div className="final-anton final-cd-num">{c.num}</div>
            <div className="final-cd-lbl">{c.lbl}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
