import AdminMatchList from "../MatchList";

export const dynamic = "force-dynamic";

// Admin group-stage list — the 72 group fixtures for entry/correction (moved
// here from the admin home, which now shows the Round of 32).
export default async function AdminGroupStage() {
  return (
    <AdminMatchList
      stage="group"
      eyebrow="ADMIN · FIFA WORLD CUP 2026"
      title="Group Stage"
      navLink={{ href: "/admin", label: "← Round of 32" }}
    />
  );
}
