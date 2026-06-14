"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { MediaType } from "@/lib/types";
import { createMoment } from "./actions";

const MOMENTS_BUCKET = "moments";
const MAX_BYTES = 50 * 1024 * 1024; // 50MB
const ALLOWED: Record<string, MediaType> = {
  "image/png": "image",
  "image/jpeg": "image",
  "video/mp4": "video",
};

const card: React.CSSProperties = {
  background: "var(--pitch-900)",
  border: "1px solid var(--pitch-line)",
  borderRadius: 16,
  padding: 26,
};

const field: React.CSSProperties = {
  width: "100%",
  background: "var(--pitch-950)",
  border: "1px solid var(--pitch-line)",
  borderRadius: 9,
  color: "var(--chalk)",
  padding: "11px 12px",
  fontSize: 15,
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13.5,
  fontWeight: 600,
};

// Strip a filename down to a safe storage key segment.
function sanitizeName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "file";
}

export default function UploadForm() {
  const router = useRouter();
  const supabase = createClient();

  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!file) {
      setErr("Pick a file to upload.");
      return;
    }
    const mediaType = ALLOWED[file.type];
    if (!mediaType) {
      setErr("Only PNG, JPG, or MP4 files are allowed.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setErr("That file is too large — max 50MB.");
      return;
    }

    setBusy(true);

    // Unique, collision-resistant object key.
    const filePath = `${Date.now()}-${sanitizeName(file.name)}`;

    const { error: upErr } = await supabase.storage
      .from(MOMENTS_BUCKET)
      .upload(filePath, file, { cacheControl: "3600", upsert: false });
    if (upErr) {
      setBusy(false);
      setErr(`Upload failed: ${upErr.message}`);
      return;
    }

    // Insert the DB row server-side (admin-checked). If it fails, clean up the
    // just-uploaded file so we don't leave an orphan in the bucket.
    const res = await createMoment(description, filePath, mediaType);
    if (!res.ok) {
      await supabase.storage.from(MOMENTS_BUCKET).remove([filePath]);
      setBusy(false);
      setErr(res.message);
      return;
    }

    router.push("/moments");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} style={card} noValidate>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <label style={labelStyle}>
          Description (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What's the moment?"
            style={{ ...field, resize: "vertical", fontFamily: "inherit" }}
          />
        </label>

        <label style={labelStyle}>
          Photo or video
          <input
            type="file"
            accept="image/png,image/jpeg,video/mp4"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setErr(null);
            }}
            style={{ ...field, padding: "9px 12px" }}
          />
          <span style={{ color: "var(--chalk-dim)", fontSize: 12 }}>
            PNG, JPG, or MP4 · up to 50MB.
          </span>
        </label>

        {err && (
          <p style={{ color: "var(--m3)", fontSize: 13.5, fontWeight: 600, margin: 0 }}>{err}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            background: "var(--gold-400)",
            color: "#1a1206",
            border: "none",
            borderRadius: 10,
            padding: "12px 18px",
            fontWeight: 700,
            fontSize: 15,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Uploading…" : "Post moment"}
        </button>
      </div>
    </form>
  );
}
