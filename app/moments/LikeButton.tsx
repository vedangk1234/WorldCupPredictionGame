"use client";

import { useTransition } from "react";
import { toggleLike } from "./actions";

// Heart toggle + count under each moment. Filled when the current user has liked
// it, outline otherwise. Calls toggleLike; the page revalidates to refresh both
// the fill state and the count.
export default function LikeButton({
  momentId,
  likeCount,
  likedByMe,
}: {
  momentId: number;
  likeCount: number;
  likedByMe: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function onToggle() {
    startTransition(async () => {
      await toggleLike(momentId);
    });
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={likedByMe}
      aria-label={likedByMe ? "Unlike" : "Like"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        background: "transparent",
        border: "1px solid var(--pitch-line)",
        borderRadius: 99,
        padding: "6px 13px",
        fontSize: 14,
        fontWeight: 700,
        color: likedByMe ? "var(--m3)" : "var(--chalk-dim)",
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.6 : 1,
      }}
    >
      <span style={{ fontSize: 15, lineHeight: 1 }}>{likedByMe ? "♥" : "♡"}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{likeCount}</span>
    </button>
  );
}
