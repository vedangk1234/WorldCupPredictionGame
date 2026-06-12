import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// The root IS the predictions screen. Logged-in users go straight to the
// matches/prediction list; logged-out users go to login. No landing page.
export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  redirect("/predictions");
}
