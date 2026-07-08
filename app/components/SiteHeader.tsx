import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth-actions";
import HamburgerMenu from "@/app/components/HamburgerMenu";
import { getActiveQuiz } from "@/lib/quiz";

// Server component. Reads the current user from the auth cookie; if logged in,
// loads their profile (name + is_admin) to decide what the right side shows.
export default async function SiteHeader() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let name: string | null = null;
  let isAdmin = false;
  let quizLive = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, is_admin")
      .eq("id", user.id)
      .single();
    name = profile?.name ?? null;
    isAdmin = profile?.is_admin ?? false;
    // Show the "Quiz" link only while a quiz is live (same server-side pattern
    // as the other conditional nav items).
    quizLive = (await getActiveQuiz(supabase)) !== null;
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        borderBottom: "1px solid var(--pitch-line)",
        // Solid theme background so scrolled content doesn't show through the
        // pinned bar. (Sticky requires no ancestor overflow-clip/transform —
        // layout.tsx renders pages straight into <body>, so none exists.)
        background: "var(--pitch-900)",
      }}
    >
      <div className="stripe-26" />
      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          padding: "14px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        {/* Far-left group: hamburger (logged-in only) sits before the wordmark. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {user && <HamburgerMenu />}
          <Link
            href="/"
            className="display"
            style={{
              color: "var(--chalk)",
              textDecoration: "none",
              fontSize: 19,
              fontWeight: 800,
              letterSpacing: "0.01em",
            }}
          >
            WC 2026 <span style={{ color: "var(--gold-300)" }}>Predictions</span>
          </Link>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 14.5 }}>
          {user ? (
            <>
              <span style={{ color: "var(--chalk-dim)" }}>
                Hi, <strong style={{ color: "var(--chalk)" }}>{name ?? "player"}</strong>
              </span>
              <Link
                href="/leaderboard"
                style={{ color: "var(--chalk)", fontWeight: 600, textDecoration: "none" }}
              >
                Leaderboard
              </Link>
              {quizLive && (
                <Link
                  href="/quiz"
                  style={{ color: "var(--gold-300)", fontWeight: 700, textDecoration: "none" }}
                >
                  Quiz
                </Link>
              )}
              <Link
                href="/moments"
                style={{ color: "var(--chalk)", fontWeight: 600, textDecoration: "none" }}
              >
                Moments
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  style={{ color: "var(--gold-300)", fontWeight: 600, textDecoration: "none" }}
                >
                  Admin
                </Link>
              )}
              <form action={signOut} style={{ margin: 0 }}>
                <button
                  type="submit"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--pitch-line)",
                    color: "var(--chalk-dim)",
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 13.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                style={{ color: "var(--chalk)", fontWeight: 600, textDecoration: "none" }}
              >
                Log in
              </Link>
              <Link
                href="/signup"
                style={{
                  background: "var(--gold-400)",
                  color: "#1a1206",
                  fontWeight: 700,
                  textDecoration: "none",
                  borderRadius: 8,
                  padding: "7px 14px",
                }}
              >
                Create account
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
