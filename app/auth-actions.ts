"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Logout. Clears the Supabase auth cookie server-side, then sends the user home.
// Wired to a small <form> posting to this action (see SiteHeader).
export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/");
}
