import AdminMatchList from "./MatchList";

export const dynamic = "force-dynamic";

// Admin home — the knockout (Round of 32) matches for result entry. The group
// stage moved behind the "Group Stage Matches" link (→ /admin/group-stage).
export default async function AdminHome() {
  return (
    <AdminMatchList
      stage="ro32"
      eyebrow="ADMIN · FIFA WORLD CUP 2026"
      title="Round of 32"
      navLink={{ href: "/admin/group-stage", label: "Group Stage Matches →" }}
    />
  );
}
