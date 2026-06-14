"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import type { MediaType } from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const MOMENTS_BUCKET = "moments";

// Insert a moments row for a file that the browser already uploaded to the
// public "moments" bucket. Admin-only (re-checked server-side — the client is
// never trusted; RLS also restricts INSERT to is_admin()). The user_id is the
// current admin's id.
export async function createMoment(
  description: string,
  filePath: string,
  mediaType: MediaType,
): Promise<ActionResult> {
  const { profile, supabase } = await requireAdmin();

  if (mediaType !== "image" && mediaType !== "video") {
    return { ok: false, message: "Invalid media type." };
  }
  const path = filePath.trim();
  if (!path) {
    return { ok: false, message: "Missing file path." };
  }

  const desc = description.trim();
  const { error } = await supabase.from("moments").insert({
    user_id: profile.id,
    description: desc.length > 0 ? desc : null,
    file_path: path,
    media_type: mediaType,
  });
  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/moments");
  return { ok: true, message: "Moment posted." };
}

// Delete a moment: remove both the storage object and the row. Admin-only.
// Confirm-gated in the UI.
export async function deleteMoment(id: number): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const { data: row, error: loadErr } = await supabase
    .from("moments")
    .select("file_path")
    .eq("id", id)
    .single();
  if (loadErr || !row) {
    return { ok: false, message: "Moment not found." };
  }

  // Remove the storage object first; if that fails, leave the row so the file
  // isn't orphaned by a half-delete.
  const { error: storageErr } = await supabase.storage
    .from(MOMENTS_BUCKET)
    .remove([row.file_path as string]);
  if (storageErr) {
    return { ok: false, message: storageErr.message };
  }

  const { error: delErr } = await supabase.from("moments").delete().eq("id", id);
  if (delErr) {
    return { ok: false, message: delErr.message };
  }

  revalidatePath("/moments");
  return { ok: true, message: "Moment deleted." };
}
