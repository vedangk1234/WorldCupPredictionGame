import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/app/components/SiteHeader";

export const dynamic = "force-dynamic";

const primaryBtn: React.CSSProperties = {
  background: "var(--gold-400)",
  color: "#1a1206",
  fontWeight: 700,
  textDecoration: "none",
  borderRadius: 10,
  padding: "12px 22px",
  fontSize: 15,
  display: "inline-block",
};

const ghostBtn: React.CSSProperties = {
  background: "var(--pitch-800)",
  color: "var(--chalk)",
  fontWeight: 700,
  textDecoration: "none",
  borderRadius: 10,
  padding: "12px 22px",
  fontSize: 15,
  border: "1px solid var(--pitch-line)",
  display: "inline-block",
};

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let name: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .single();
    name = profile?.name ?? null;
  }

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "10vh 24px 80px" }}>
        <p
          style={{
            color: "var(--gold-400)",
            letterSpacing: "0.18em",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          FIFA WORLD CUP 2026 · GROUP STAGE
        </p>
        <h1 className="display" style={{ fontSize: 56, lineHeight: 1.02, margin: "10px 0 18px" }}>
          Predictions League
        </h1>

        {user ? (
          <>
            <p style={{ color: "var(--chalk-dim)", fontSize: 18, maxWidth: 540 }}>
              Welcome back{name ? `, ${name}` : ""}. Lock in your scorelines and chase the
              top of the board.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
              <Link href="/predictions" style={primaryBtn}>
                Make Predictions
              </Link>
              <Link href="/leaderboard" style={ghostBtn}>
                Leaderboard
              </Link>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: "var(--chalk-dim)", fontSize: 18, maxWidth: 540 }}>
              Predict the scoreline and the scorers of all 72 group-stage matches. Points
              stack up, a global leaderboard ranks the group — bragging rights only.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
              <Link href="/signup" style={primaryBtn}>
                Create account
              </Link>
              <Link href="/login" style={ghostBtn}>
                Log in
              </Link>
            </div>
          </>
        )}
      </main>
    </>
  );
}
