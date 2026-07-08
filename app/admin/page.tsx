import AdminMatchList from "./MatchList";

export const dynamic = "force-dynamic";

// Admin home — the newest knockout (Quarter-finals) matches for result entry. The
// Round of 16, Round of 32 and Group Stage lists live behind their own links.
export default async function AdminHome() {
  return (
    <AdminMatchList
      stage="qf"
      eyebrow="ADMIN · FIFA WORLD CUP 2026"
      title="Quarter-finals"
      navLinks={[
        { href: "/admin/ro16", label: "RO16 Matches →" },
        { href: "/admin/ro32", label: "RO32 Matches →" },
        { href: "/admin/group-stage", label: "Group Stage Matches →" },
      ]}
    />
  );
}
