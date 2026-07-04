import AdminMatchList from "./MatchList";

export const dynamic = "force-dynamic";

// Admin home — the newest knockout (Round of 16) matches for result entry. The
// Round of 32 and Group Stage lists live behind their own links.
export default async function AdminHome() {
  return (
    <AdminMatchList
      stage="ro16"
      eyebrow="ADMIN · FIFA WORLD CUP 2026"
      title="Round of 16"
      navLinks={[
        { href: "/admin/ro32", label: "RO32 Matches →" },
        { href: "/admin/group-stage", label: "Group Stage Matches →" },
      ]}
    />
  );
}
