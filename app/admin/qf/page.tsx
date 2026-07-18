import AdminMatchList from "../MatchList";

export const dynamic = "force-dynamic";

// Admin Quarter-finals list — the qf knockout matches for entry/correction
// (moved here from the admin home, which now shows the Third-place match).
export default async function AdminQf() {
  return (
    <AdminMatchList
      stage="qf"
      eyebrow="ADMIN · FIFA WORLD CUP 2026"
      title="Quarter-finals"
      navLinks={[{ href: "/admin", label: "← Third-place match" }]}
    />
  );
}
