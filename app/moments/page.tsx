import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import { requireUser } from "@/lib/auth";
import { fmtTime } from "@/lib/format";
import type { Moment, MomentCommentView } from "@/lib/types";
import DeleteMomentButton from "./DeleteMomentButton";
import LikeButton from "./LikeButton";
import Comments from "./Comments";

export const dynamic = "force-dynamic";

const MOMENTS_BUCKET = "moments";

// The shared photo/video scrapbook. Any logged-in user can view; only admins
// can upload (/moments/new) or delete. Newest first, single-column feed.
export default async function MomentsPage() {
  const { supabase, timeZone } = await requireUser();

  // Is the viewer an admin? Decides whether upload/delete controls render.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    isAdmin = profile?.is_admin ?? false;
  }

  const { data, error } = await supabase
    .from("moments")
    .select("*")
    .order("created_at", { ascending: false });
  const moments = (data ?? []) as Moment[];

  // Batch-load likes + comments for all loaded moments (no per-moment queries).
  const momentIds = moments.map((m) => m.id);
  const likeCount = new Map<number, number>();
  const likedByMe = new Set<number>();
  const commentsByMoment = new Map<number, MomentCommentView[]>();

  if (momentIds.length > 0) {
    // Likes: pull (moment_id, user_id) for these moments, then count + flag mine.
    const { data: likeRows } = await supabase
      .from("moment_likes")
      .select("moment_id, user_id")
      .in("moment_id", momentIds);
    for (const row of likeRows ?? []) {
      const mid = row.moment_id as number;
      likeCount.set(mid, (likeCount.get(mid) ?? 0) + 1);
      if (user && row.user_id === user.id) likedByMe.add(mid);
    }

    // Comments: load all for these moments oldest-first, then resolve authors via
    // a single profiles lookup keyed by the distinct user_ids.
    const { data: commentRows } = await supabase
      .from("moment_comments")
      .select("id, moment_id, user_id, body, created_at")
      .in("moment_id", momentIds)
      .order("created_at", { ascending: true });

    const authorIds = Array.from(
      new Set((commentRows ?? []).map((c) => c.user_id as string)),
    );
    const authorById = new Map<string, { name: string; username: string }>();
    if (authorIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name, username")
        .in("id", authorIds);
      for (const p of profs ?? []) {
        authorById.set(p.id as string, {
          name: p.name as string,
          username: p.username as string,
        });
      }
    }

    for (const c of commentRows ?? []) {
      const author = authorById.get(c.user_id as string);
      const view: MomentCommentView = {
        id: c.id as number,
        moment_id: c.moment_id as number,
        user_id: c.user_id as string,
        body: c.body as string,
        created_at: c.created_at as string,
        name: author?.name ?? "Unknown",
        username: author?.username ?? "unknown",
        mine: (user?.id === c.user_id) || isAdmin,
      };
      const list = commentsByMoment.get(view.moment_id) ?? [];
      list.push(view);
      commentsByMoment.set(view.moment_id, list);
    }
  }

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 20px 96px" }}>
        <Link
          href="/"
          style={{
            display: "inline-block",
            color: "var(--chalk-dim)",
            textDecoration: "none",
            fontSize: 13.5,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          ← Home
        </Link>

        <div className="stripe-26" style={{ borderRadius: 99, marginBottom: 18, maxWidth: 120 }} />
        <p
          style={{
            color: "var(--gold-400)",
            letterSpacing: "0.18em",
            fontSize: 12,
            fontWeight: 700,
            margin: 0,
          }}
        >
          FIFA WORLD CUP 2026 · THE GROUP
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
            margin: "8px 0 24px",
          }}
        >
          <h1 className="display" style={{ fontSize: 40, lineHeight: 1.05, margin: 0 }}>
            Moments
          </h1>
          {isAdmin && (
            <Link
              href="/moments/new"
              style={{
                background: "var(--gold-400)",
                color: "#1a1206",
                fontWeight: 700,
                textDecoration: "none",
                borderRadius: 9,
                padding: "9px 16px",
                fontSize: 14,
              }}
            >
              Upload a moment
            </Link>
          )}
        </div>

        {error && (
          <p style={{ color: "var(--m3)" }}>Failed to load moments: {error.message}</p>
        )}

        {!error && moments.length === 0 && (
          <p style={{ color: "var(--chalk-dim)", fontSize: 15 }}>No moments yet.</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
          {moments.map((m) => {
            const {
              data: { publicUrl },
            } = supabase.storage.from(MOMENTS_BUCKET).getPublicUrl(m.file_path);

            return (
              <article
                key={m.id}
                style={{
                  background: "var(--pitch-900)",
                  border: "1px solid var(--pitch-line)",
                  borderRadius: 16,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "12px 16px",
                  }}
                >
                  <span style={{ color: "var(--chalk-dim)", fontSize: 12.5 }}>
                    {fmtTime(m.created_at, timeZone)}
                  </span>
                  {isAdmin && <DeleteMomentButton id={m.id} />}
                </div>

                {m.description && (
                  <p
                    style={{
                      margin: 0,
                      padding: "0 16px 14px",
                      color: "var(--chalk)",
                      fontSize: 15.5,
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {m.description}
                  </p>
                )}

                {m.media_type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={publicUrl}
                    alt={m.description ?? "Moment"}
                    loading="lazy"
                    style={{ display: "block", width: "100%", height: "auto" }}
                  />
                ) : (
                  <video
                    src={publicUrl}
                    controls
                    playsInline
                    preload="metadata"
                    style={{ display: "block", width: "100%", height: "auto", background: "#000" }}
                  />
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px 12px" }}>
                  <LikeButton
                    momentId={m.id}
                    likeCount={likeCount.get(m.id) ?? 0}
                    likedByMe={likedByMe.has(m.id)}
                  />
                </div>

                <Comments
                  momentId={m.id}
                  comments={commentsByMoment.get(m.id) ?? []}
                  userTimeZone={timeZone}
                />
              </article>
            );
          })}
        </div>
      </main>
    </>
  );
}
