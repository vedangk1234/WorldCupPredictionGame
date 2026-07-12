import AdminMatchList from "../MatchList";

export const dynamic = "force-dynamic";

// Admin Round-of-16 list — the ro16 knockout matches for entry/correction
// (moved here from the admin home, which now shows the Quarter-finals).
export default async function AdminRo16() {
  return (
    <AdminMatchList
      stage="ro16"
      eyebrow="ADMIN · FIFA WORLD CUP 2026"
      title="Round of 16"
      navLinks={[{ href: "/admin", label: "← Semi-finals" }]}
    />
  );
}
