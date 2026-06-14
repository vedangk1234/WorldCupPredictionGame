"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth";
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

// Toggle the current user's like on a moment (count only — no liker names). Any
// logged-in user. If their (moment_id, user_id) row exists, delete it; otherwise
// insert it. The unique(moment_id, user_id) constraint makes a double-insert a
// no-op race — we swallow the duplicate-key error so the toggle stays graceful.
export async function toggleLike(momentId: number): Promise<ActionResult> {
  const { user, supabase } = await requireUser();

  const { data: existing } = await supabase
    .from("moment_likes")
    .select("id")
    .eq("moment_id", momentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("moment_likes")
      .delete()
      .eq("id", existing.id);
    if (error) return { ok: false, message: error.message };
  } else {
    const { error } = await supabase
      .from("moment_likes")
      .insert({ moment_id: momentId, user_id: user.id });
    // 23505 = unique violation (a concurrent like) — treat as already liked.
    if (error && error.code !== "23505") {
      return { ok: false, message: error.message };
    }
  }

  revalidatePath("/moments");
  return { ok: true, message: "OK" };
}

// Add a comment to a moment. Any logged-in user; author recorded as user_id.
export async function addComment(
  momentId: number,
  body: string,
): Promise<ActionResult> {
  const { user, supabase } = await requireUser();

  const text = body.trim();
  if (!text) return { ok: false, message: "Comment can't be empty." };
  if (text.length > 1000) {
    return { ok: false, message: "Comment is too long (max 1000 characters)." };
  }

  const { error } = await supabase.from("moment_comments").insert({
    moment_id: momentId,
    user_id: user.id,
    body: text,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/moments");
  return { ok: true, message: "Comment posted." };
}

// Delete a comment. Allowed if it's the current user's own OR the user is admin.
// Re-checked server-side here; RLS enforces the same rule as a backstop.
export async function deleteComment(commentId: number): Promise<ActionResult> {
  const { user, supabase } = await requireUser();

  const { data: row, error: loadErr } = await supabase
    .from("moment_comments")
    .select("user_id")
    .eq("id", commentId)
    .single();
  if (loadErr || !row) return { ok: false, message: "Comment not found." };

  if (row.user_id !== user.id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (!profile?.is_admin) {
      return { ok: false, message: "You can't delete this comment." };
    }
  }

  const { error } = await supabase
    .from("moment_comments")
    .delete()
    .eq("id", commentId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/moments");
  return { ok: true, message: "Comment deleted." };
}
