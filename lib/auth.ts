import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

type ServerClient = ReturnType<typeof createClient>;

// Fallback display zone when a profile has no timezone set.
const DEFAULT_TIME_ZONE = "Asia/Kolkata";

// Server-side gate for any logged-in user page. Loads the current user from the
// auth cookie and redirects to "/login" if not signed in. Every user-facing
// write re-checks via this (or getUser) server-side — the client is never
// trusted. Returns the user, the same Supabase client for reuse, and the user's
// own display timezone (profiles.timezone; null/empty → "Asia/Kolkata"). The
// timezone is DISPLAY ONLY — deadlines/locking/scoring run on UTC instants and
// never read it.
export async function requireUser(): Promise<{
  user: User;
  supabase: ServerClient;
  timeZone: string;
}> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  const timeZone =
    profile?.timezone && profile.timezone.trim() !== ""
      ? profile.timezone
      : DEFAULT_TIME_ZONE;

  return { user, supabase, timeZone };
}

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
