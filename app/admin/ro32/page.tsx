import AdminMatchList from "../MatchList";

export const dynamic = "force-dynamic";

// Admin Round-of-32 list — the 16 ro32 knockout matches for entry/correction
// (moved here from the admin home, which now shows the Round of 16).
export default async function AdminRo32() {
  return (
    <AdminMatchList
      stage="ro32"
      eyebrow="ADMIN · FIFA WORLD CUP 2026"
      title="Round of 32"
      navLinks={[{ href: "/admin", label: "← Round of 16" }]}
    />
  );
}
