"use client";

import { useState, useTransition } from "react";
import { deleteMoment } from "./actions";

// Small admin-only delete control on each moment. Two-step: the first click
// arms a confirm, the second deletes. Calls the deleteMoment server action.
export default function DeleteMomentButton({ id }: { id: number }) {
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onDelete() {
    setErr(null);
    startTransition(async () => {
      const res = await deleteMoment(id);
      if (!res.ok) {
        setErr(res.message);
        setConfirming(false);
      }
      // On success the page revalidates and the item disappears.
    });
  }

  if (confirming) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "var(--chalk-dim)", fontSize: 12.5 }}>Delete this?</span>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          style={{
            background: "var(--m3, #c0392b)",
            border: "none",
            color: "#fff",
            borderRadius: 7,
            padding: "5px 11px",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          style={{
            background: "transparent",
            border: "1px solid var(--pitch-line)",
            color: "var(--chalk-dim)",
            borderRadius: 7,
            padding: "5px 11px",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        {err && <span style={{ color: "var(--m3)", fontSize: 12.5 }}>{err}</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      style={{
        background: "transparent",
        border: "1px solid var(--pitch-line)",
        color: "var(--chalk-dim)",
        borderRadius: 7,
        padding: "5px 11px",
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      Delete
    </button>
  );
}
