/**
 * YouTube ingest service — single source of truth for "user pasted a
 * YouTube URL, save it as a creator-channel item." The channel page
 * UI, the bulk-import flow (when it lands), and any admin tooling all
 * route through `ingestYoutubeUrl()`.
 *
 * Implementation uses YouTube's public oEmbed endpoint — no API key
 * required, no quota concerns at the volumes we're seeing. oEmbed
 * surfaces title, author (channel name), thumbnail, and HTML embed
 * snippet. Duration is NOT in the oEmbed payload, so the channel
 * page falls back to the YouTube player UI for runtime display when
 * `duration_sec` is null.
 */

import { and, eq } from "drizzle-orm";

import type { Db } from "../../db/index.js";
import {
  creatorYoutubeIngests,
  type CreatorYoutubeIngest,
} from "../../db/schema/creator.js";

// `drizzle-orm/postgres-js` + the `postgres` package don't bundle for
// Cloudflare Workers — see profile-mode.ts for the full story. Use the
// project-canonical `Db` type instead.

export interface YoutubeIngestResult {
  ingest: CreatorYoutubeIngest;
  /** True when the row already existed; false when freshly inserted. */
  alreadyImported: boolean;
}

/** Extract the YouTube video id from any common URL shape. Single
 *  parser so the route handler, future bulk-import, and any
 *  validation code use the exact same rules. */
export function extractYoutubeVideoId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  // Match these forms:
  //   https://www.youtube.com/watch?v=ID
  //   https://youtu.be/ID
  //   https://www.youtube.com/embed/ID
  //   https://www.youtube.com/shorts/ID
  //   https://www.youtube.com/live/ID
  //   plain ID (11 chars, [A-Za-z0-9_-])
  const hostedRe =
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/;
  const m = hostedRe.exec(trimmed);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

interface OembedPayload {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
  html?: string;
}

async function fetchOembed(videoId: string): Promise<OembedPayload | null> {
  const url = new URL("https://www.youtube.com/oembed");
  url.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
  url.searchParams.set("format", "json");
  try {
    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) return null;
    return (await res.json()) as OembedPayload;
  } catch {
    return null;
  }
}

/**
 * Ingest a YouTube URL for a user. Idempotent — re-importing the same
 * video updates the metadata and marks `alreadyImported = true` rather
 * than failing.
 */
export async function ingestYoutubeUrl(
  db: Db,
  userId: string,
  url: string,
): Promise<YoutubeIngestResult> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    throw new Error("Couldn't parse a YouTube video id from that URL");
  }

  const oembed = await fetchOembed(videoId);
  const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const [existing] = await db
    .select()
    .from(creatorYoutubeIngests)
    .where(
      and(
        eq(creatorYoutubeIngests.userId, userId),
        eq(creatorYoutubeIngests.youtubeVideoId, videoId),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(creatorYoutubeIngests)
       
      .set({
        title: oembed?.title ?? existing.title,
        thumbnailUrl: oembed?.thumbnail_url ?? existing.thumbnailUrl,
        channelName: oembed?.author_name ?? existing.channelName,
        channelUrl: oembed?.author_url ?? existing.channelUrl,
        sourceUrl,
      } as any)
      .where(eq(creatorYoutubeIngests.id, existing.id))
      .returning();
    return { ingest: updated, alreadyImported: true };
  }

  const [inserted] = await db
    .insert(creatorYoutubeIngests)
     
    .values({
      userId,
      youtubeVideoId: videoId,
      sourceUrl,
      title: oembed?.title ?? null,
      thumbnailUrl: oembed?.thumbnail_url ?? null,
      channelName: oembed?.author_name ?? null,
      channelUrl: oembed?.author_url ?? null,
    } as any)
    .returning();
  return { ingest: inserted, alreadyImported: false };
}

/** List a user's ingested YouTube videos in display order (most recent first). */
export async function listIngests(
  db: Db,
  userId: string,
  opts: { includeHidden?: boolean } = {},
): Promise<CreatorYoutubeIngest[]> {
  const conditions = opts.includeHidden
    ? [eq(creatorYoutubeIngests.userId, userId)]
    : [
        eq(creatorYoutubeIngests.userId, userId),
        eq(creatorYoutubeIngests.isHidden, false),
      ];
  return db
    .select()
    .from(creatorYoutubeIngests)
    .where(and(...conditions))
    .orderBy(creatorYoutubeIngests.displayOrder, creatorYoutubeIngests.ingestedAt);
}

/** Hide / unhide an ingest. Owner check happens at the route boundary. */
export async function setIngestHidden(
  db: Db,
  ingestId: string,
  ownerUserId: string,
  hidden: boolean,
): Promise<void> {
  await db
    .update(creatorYoutubeIngests)
     
    .set({ isHidden: hidden } as any)
    .where(
      and(
        eq(creatorYoutubeIngests.id, ingestId),
        eq(creatorYoutubeIngests.userId, ownerUserId),
      ),
    );
}

export async function deleteIngest(
  db: Db,
  ingestId: string,
  ownerUserId: string,
): Promise<void> {
  await db
    .delete(creatorYoutubeIngests)
    .where(
      and(
        eq(creatorYoutubeIngests.id, ingestId),
        eq(creatorYoutubeIngests.userId, ownerUserId),
      ),
    );
}
