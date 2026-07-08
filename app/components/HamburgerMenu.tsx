"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Small ☰ dropdown in the navbar. Toggles on tap, closes on outside tap or when
// a link inside is clicked. Styled with the existing design tokens.
export default function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        type="button"
        aria-label="Menu"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent",
          border: "1px solid var(--pitch-line)",
          color: "var(--chalk)",
          borderRadius: 8,
          padding: "6px 11px",
          fontSize: 16,
          lineHeight: 1,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        ☰
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            // Button now sits at the far left of the navbar, so open rightward.
            left: 0,
            minWidth: 200,
            background: "var(--pitch-900)",
            border: "1px solid var(--pitch-line)",
            borderRadius: 10,
            padding: 6,
            boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
            zIndex: 60,
          }}
        >
          <Link
            href="/ro16"
            role="menuitem"
            onClick={() => setOpen(false)}
            style={{
              display: "block",
              color: "var(--chalk)",
              fontWeight: 600,
              textDecoration: "none",
              padding: "9px 12px",
              borderRadius: 7,
              fontSize: 14.5,
            }}
          >
            RO16 Matches
          </Link>
          <Link
            href="/ro32"
            role="menuitem"
            onClick={() => setOpen(false)}
            style={{
              display: "block",
              color: "var(--chalk)",
              fontWeight: 600,
              textDecoration: "none",
              padding: "9px 12px",
              borderRadius: 7,
              fontSize: 14.5,
            }}
          >
            RO32 Matches
          </Link>
          <Link
            href="/group-stage"
            role="menuitem"
            onClick={() => setOpen(false)}
            style={{
              display: "block",
              color: "var(--chalk)",
              fontWeight: 600,
              textDecoration: "none",
              padding: "9px 12px",
              borderRadius: 7,
              fontSize: 14.5,
            }}
          >
            Group Stage Matches
          </Link>
        </div>
      )}
    </div>
  );
}
