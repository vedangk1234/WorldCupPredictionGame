import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

type ServerClient = ReturnType<typeof createClient>;

// Server-side gate for the admin area. Loads the current user from the auth
// cookie, reads their profiles row, and redirects to "/" unless they are logged
// in AND is_admin. Every admin page and every admin write calls this first —
// the client is never trusted. Returns the verified profile plus the same
// Supabase client so callers can reuse it.
export async function requireAdmin(): Promise<{
  profile: Profile;
  supabase: ServerClient;
}> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_admin) redirect("/");

  return { profile: profile as Profile, supabase };
}
