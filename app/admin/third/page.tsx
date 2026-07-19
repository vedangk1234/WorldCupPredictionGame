import AdminMatchList from "../MatchList";

export const dynamic = "force-dynamic";

// Admin Third-place match list — the third knockout match(es) for entry/correction
// (moved here from the admin home, which now shows the Final).
export default async function AdminThird() {
  return (
    <AdminMatchList
      stage="third"
      eyebrow="ADMIN · FIFA WORLD CUP 2026"
      title="Third-place match"
      navLinks={[{ href: "/admin", label: "← Final" }]}
    />
  );
}
