import SiteHeader from "@/app/components/SiteHeader";

export const dynamic = "force-dynamic";

// Placeholder — the real prediction cards arrive in the next Phase 3 section.
export default function PredictionsPage() {
  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "10vh 24px 80px" }}>
        <div className="stripe-26" style={{ borderRadius: 99, marginBottom: 22, maxWidth: 120 }} />
        <h1 className="display" style={{ fontSize: 40, lineHeight: 1.05, margin: "0 0 14px" }}>
          Make Predictions
        </h1>
        <p style={{ color: "var(--chalk-dim)", fontSize: 18 }}>Coming in the next update.</p>
      </main>
    </>
  );
}
