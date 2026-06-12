"use client";

import { useState, useTransition } from "react";
import { setUnderdog } from "../../actions";

interface Props {
  matchId: number;
  teamA: { id: number; name: string };
  teamB: { id: number; name: string };
  initialUnderdogId: number | null;
}

const card: React.CSSProperties = {
  background: "var(--pitch-900)",
  border: "1px solid var(--pitch-line)",
  borderRadius: 12,
  padding: 18,
};

export default function UnderdogControl({ matchId, teamA, teamB, initialUnderdogId }: Props) {
  const [choice, setChoice] = useState<number | null>(initialUnderdogId);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const options: { value: number | null; label: string }[] = [
    { value: teamA.id, label: `${teamA.name} is underdog` },
    { value: teamB.id, label: `${teamB.name} is underdog` },
    { value: null, label: "No underdog" },
  ];

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await setUnderdog(matchId, choice);
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  return (
    <section style={card}>
      <h2 className="display" style={{ fontSize: 17, margin: "0 0 4px" }}>
        ⚡ Underdog
      </h2>
      <p style={{ color: "var(--chalk-dim)", fontSize: 13, margin: "0 0 14px" }}>
        +5 to anyone who predicted the underdog to win — only if the underdog
        actually wins. Editable any time.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {options.map((o) => {
          const selected = choice === o.value;
          return (
            <label
              key={String(o.value)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 12px",
                borderRadius: 9,
                cursor: "pointer",
                border: selected
                  ? "1px solid rgba(243,201,105,0.55)"
                  : "1px solid var(--pitch-line)",
                background: selected ? "rgba(243,201,105,0.12)" : "transparent",
              }}
            >
              <input
                type="radio"
                name="underdog"
                checked={selected}
                onChange={() => setChoice(o.value)}
                style={{ accentColor: "var(--gold-400)" }}
              />
              <span style={{ fontWeight: selected ? 700 : 500 }}>{o.label}</span>
            </label>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          style={{
            background: "var(--gold-400)",
            color: "#1a1206",
            border: "none",
            borderRadius: 9,
            padding: "9px 16px",
            fontWeight: 700,
            cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? "Saving…" : "Save underdog"}
        </button>
        {msg && (
          <span style={{ fontSize: 13, color: msg.ok ? "var(--pitch-500)" : "var(--m3)" }}>
            {msg.text}
          </span>
        )}
      </div>
    </section>
  );
}
