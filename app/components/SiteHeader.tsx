import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth-actions";

// Server component. Reads the current user from the auth cookie; if logged in,
// loads their profile (name + is_admin) to decide what the right side shows.
export default async function SiteHeader() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let name: string | null = null;
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, is_admin")
      .eq("id", user.id)
      .single();
    name = profile?.name ?? null;
    isAdmin = profile?.is_admin ?? false;
  }

  return (
    <header style={{ borderBottom: "1px solid var(--pitch-line)", background: "var(--pitch-900)" }}>
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

        <nav style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 14.5 }}>
          {user ? (
            <>
              <span style={{ color: "var(--chalk-dim)" }}>
                Hi, <strong style={{ color: "var(--chalk)" }}>{name ?? "player"}</strong>
              </span>
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
