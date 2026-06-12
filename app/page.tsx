import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function checkConnection() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, detail: "Environment variables not set." };
  try {
    const supabase = createClient();
    // Lightweight query against a table created by schema.sql.
    const { error } = await supabase.from("teams").select("id", { count: "exact", head: true });
    if (error) return { ok: false, detail: `DB error: ${error.message}` };
    return { ok: true, detail: "Connected to Supabase and the schema is in place." };
  } catch (e) {
    return { ok: false, detail: `Unexpected error: ${(e as Error).message}` };
  }
}

export default async function Home() {
  const status = await checkConnection();
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "10vh 24px" }}>
      <div className="stripe-26" style={{ borderRadius: 99, marginBottom: 28 }} />
      <p style={{ color: "var(--gold-400)", letterSpacing: "0.18em", fontSize: 12, fontWeight: 700 }}>
        FIFA WORLD CUP 2026 · GROUP STAGE
      </p>
      <h1 className="display" style={{ fontSize: 56, lineHeight: 1.02, margin: "10px 0 18px" }}>
        Predictions League
      </h1>
      <p style={{ color: "var(--chalk-dim)", fontSize: 18, maxWidth: 540 }}>
        Foundation is live. The admin panel and prediction pages arrive in the next phases.
      </p>

      <div
        style={{
          marginTop: 36, padding: 18, borderRadius: 14,
          background: "var(--pitch-900)", border: "1px solid var(--pitch-line)",
          display: "flex", gap: 12, alignItems: "center",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 12, height: 12, borderRadius: 99,
            background: status.ok ? "var(--pitch-500)" : "var(--m3)",
            boxShadow: status.ok ? "0 0 12px var(--pitch-500)" : "none",
          }}
        />
        <div>
          <strong>{status.ok ? "Setup check passed" : "Setup incomplete"}</strong>
          <div style={{ color: "var(--chalk-dim)", fontSize: 14 }}>{status.detail}</div>
        </div>
      </div>
    </main>
  );
}
