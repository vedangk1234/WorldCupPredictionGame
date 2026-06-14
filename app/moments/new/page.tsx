import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import { requireAdmin } from "@/lib/auth";
import UploadForm from "../UploadForm";

export const dynamic = "force-dynamic";

// Admin-only upload page. requireAdmin() redirects non-admins to "/" before
// anything renders; the client form does the actual storage upload.
export default async function NewMomentPage() {
  await requireAdmin();

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 20px 96px" }}>
        <Link
          href="/moments"
          style={{
            display: "inline-block",
            color: "var(--chalk-dim)",
            textDecoration: "none",
            fontSize: 13.5,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          ← Back to Moments
        </Link>

        <div className="stripe-26" style={{ borderRadius: 99, marginBottom: 18, maxWidth: 120 }} />
        <h1 className="display" style={{ fontSize: 36, lineHeight: 1.05, margin: "0 0 8px" }}>
          Upload a moment
        </h1>
        <p style={{ color: "var(--chalk-dim)", fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
          Add a photo (PNG/JPG) or a video (MP4), up to 50MB. A description is optional.
        </p>

        <UploadForm />
      </main>
    </>
  );
}
