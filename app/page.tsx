import SiteHeader from "@/app/components/SiteHeader";
import TournamentStats from "@/app/components/TournamentStats";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// The tournament is over — the home page is now the Tournament Stats showcase.
// Every knockout stage has its own page behind the navbar hamburger menu (the
// Final at /final, the Third-place match at /third, the Semi-finals at /sf, the
// Quarter-finals at /qf, the Round of 16 at /ro16, the Round of 32 at /ro32 and
// the group stage at /group-stage). Logged-out users are sent to /login by
// requireUser().
export default async function Home() {
  await requireUser();

  return (
    <>
      <SiteHeader />
      <main className="preds-layout">
        <TournamentStats />
      </main>
    </>
  );
}
