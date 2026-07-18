import AdminMatchList from "./MatchList";

export const dynamic = "force-dynamic";

// Admin home — the newest knockout (Third-place match) for result entry. The
// Semi-finals, Quarter-finals, Round of 16, Round of 32 and Group Stage lists live
// behind their own links.
export default async function AdminHome() {
  return (
    <AdminMatchList
      stage="third"
      eyebrow="ADMIN · FIFA WORLD CUP 2026"
      title="Third-place match"
      navLinks={[
        { href: "/admin/outrights", label: "Outrights →" },
        { href: "/admin/sf", label: "Semi-finals →" },
        { href: "/admin/qf", label: "Quarter-finals →" },
        { href: "/admin/ro16", label: "RO16 Matches →" },
        { href: "/admin/ro32", label: "RO32 Matches →" },
        { href: "/admin/group-stage", label: "Group Stage Matches →" },
      ]}
    />
  );
}
