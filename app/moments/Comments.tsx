"use client";

import { useState, useTransition } from "react";
import { fmtTime } from "@/lib/format";
import type { MomentCommentView } from "@/lib/types";
import { addComment, deleteComment } from "./actions";

// The comment thread under a moment: an oldest-first list followed by an
// "Add a comment" box. Anyone logged-in can post; a comment shows a delete (×)
// only when it's the current user's own OR the user is admin (confirm-gated).
export default function Comments({
  momentId,
  comments,
  userTimeZone,
}: {
  momentId: number;
  comments: MomentCommentView[];
  // Viewer's own display zone (profiles.timezone, default "Asia/Kolkata").
  userTimeZone: string;
}) {
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onPost() {
    const text = body.trim();
    if (!text) {
      setErr("Comment can't be empty.");
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await addComment(momentId, text);
      if (res.ok) {
        setBody("");
      } else {
        setErr(res.message);
      }
    });
  }

  return (
    <div style={{ padding: "0 16px 16px" }}>
      {comments.length === 0 ? (
        <p style={{ color: "var(--chalk-dim)", fontSize: 13.5, margin: "0 0 12px" }}>
          No comments yet.
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: "0 0 12px",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {comments.map((c) => (
            <li key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--chalk)" }}>
                    {c.name}{" "}
                    <span style={{ fontWeight: 500, color: "var(--chalk-dim)" }}>
                      (@{c.username})
                    </span>
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--chalk-dim)" }}>
                    {fmtTime(c.created_at, userTimeZone)}
                  </span>
                </div>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: 14.5,
                    lineHeight: 1.5,
                    color: "var(--chalk)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {c.body}
                </p>
              </div>
              {c.mine && <DeleteCommentButton id={c.id} />}
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          rows={2}
          maxLength={1000}
          style={{
            width: "100%",
            resize: "vertical",
            background: "var(--pitch-950)",
            border: "1px solid var(--pitch-line)",
            borderRadius: 9,
            color: "var(--chalk)",
            fontSize: 14.5,
            padding: "9px 11px",
            fontFamily: "inherit",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={onPost}
            disabled={pending || body.trim().length === 0}
            style={{
              background: "var(--gold-400)",
              color: "#1a1206",
              fontWeight: 700,
              border: "none",
              borderRadius: 9,
              padding: "8px 16px",
              fontSize: 13.5,
              cursor: pending || body.trim().length === 0 ? "default" : "pointer",
              opacity: pending || body.trim().length === 0 ? 0.55 : 1,
            }}
          >
            {pending ? "Posting…" : "Post"}
          </button>
          {err && <span style={{ color: "var(--m3)", fontSize: 12.5 }}>{err}</span>}
        </div>
      </div>
    </div>
  );
}

// Two-step delete (×) on a comment: first click arms, second deletes.
function DeleteCommentButton({ id }: { id: number }) {
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onDelete() {
    setErr(null);
    startTransition(async () => {
      const res = await deleteComment(id);
      if (!res.ok) {
        setErr(res.message);
        setConfirming(false);
      }
      // On success the page revalidates and the comment disappears.
    });
  }

  if (confirming) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          style={{
            background: "var(--m3, #c0392b)",
            border: "none",
            color: "#fff",
            borderRadius: 6,
            padding: "3px 8px",
            fontSize: 11.5,
            fontWeight: 700,
            cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? "…" : "Delete"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          style={{
            background: "transparent",
            border: "1px solid var(--pitch-line)",
            color: "var(--chalk-dim)",
            borderRadius: 6,
            padding: "3px 8px",
            fontSize: 11.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        {err && <span style={{ color: "var(--m3)", fontSize: 11.5 }}>{err}</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label="Delete comment"
      title="Delete comment"
      style={{
        background: "transparent",
        border: "none",
        color: "var(--chalk-dim)",
        fontSize: 16,
        lineHeight: 1,
        padding: "0 4px",
        cursor: "pointer",
      }}
    >
      ×
    </button>
  );
}
