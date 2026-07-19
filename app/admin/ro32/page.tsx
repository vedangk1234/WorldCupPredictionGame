import AdminMatchList from "../MatchList";

export const dynamic = "force-dynamic";

// Admin Round-of-32 list — the ro32 knockout matches for entry/correction
// (moved here from the admin home, which now shows the Quarter-finals).
export default async function AdminRo32() {
  return (
    <AdminMatchList
      stage="ro32"
      eyebrow="ADMIN · FIFA WORLD CUP 2026"
      title="Round of 32"
      navLinks={[{ href: "/admin", label: "← Final" }]}
    />
  );
}
