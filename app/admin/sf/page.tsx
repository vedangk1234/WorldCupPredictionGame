import AdminMatchList from "../MatchList";

export const dynamic = "force-dynamic";

// Admin Semi-finals list — the sf knockout matches for entry/correction (moved
// here from the admin home, which now shows the Third-place match).
export default async function AdminSf() {
  return (
    <AdminMatchList
      stage="sf"
      eyebrow="ADMIN · FIFA WORLD CUP 2026"
      title="Semi-finals"
      navLinks={[{ href: "/admin", label: "← Third-place match" }]}
    />
  );
}
