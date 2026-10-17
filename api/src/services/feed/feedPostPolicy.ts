/**
 * Feed post policy — pure rules for the social feed (no I/O).
 *
 * Feed post privacy mirrors resume privacy (KISS): Public | Recruiter | Connections | Private.
 *   Public      → anyone (logged in or out)
 *   Recruiter   → recruiters, employers, super-admins, and the author
 *   Connections → author only (connection graph not yet wired in — treat as private-to-author)
 *   Private     → author only
 * Community posts (pro Employee Community feature) are stored in the same table with
 * privacy="Private" AND a "company:{id}:{channel}" tag. They must never appear in the
 * public feed, even for their own author — that feed lives at /api/community/posts.
 * (The SQL form of the visibility rule lives in feedPostsRepository.)
 */

import type { JwtPayload } from "../../types/index.js";

export const FEED_PRIVACY_VALUES = ["Public", "Recruiter", "Connections", "Private"] as const;
export type FeedPrivacy = (typeof FEED_PRIVACY_VALUES)[number];

export function normalizePrivacy(value: unknown, fallback: FeedPrivacy = "Public"): FeedPrivacy {
  return (FEED_PRIVACY_VALUES as readonly string[]).includes(String(value))
    ? (String(value) as FeedPrivacy)
    : fallback;
}

// Post kind discriminator (gap #1828): text | video | article.
export const FEED_KIND_VALUES = ["text", "video", "article"] as const;
export type FeedKind = (typeof FEED_KIND_VALUES)[number];

/** Resolve the post kind. An explicit body value wins; otherwise infer 'video'
 *  when the post carries video media so callers that don't send `kind` still
 *  get the right type for reels. */
export function resolveKind(
  value: unknown,
  media: Array<{ mediaType?: string }>,
  fallback: FeedKind = "text",
): FeedKind {
  if ((FEED_KIND_VALUES as readonly string[]).includes(String(value))) {
    return String(value) as FeedKind;
  }
  if (media.some((m) => m.mediaType === "Video")) return "video";
  return fallback;
}

/** Viewers who may see `Recruiter`-privacy posts. */
export function isRecruiterLike(user: JwtPayload | undefined): boolean {
  if (!user) return false;
  const roles = user.roles ?? [];
  return (
    Boolean(user.isSuperAdmin) ||
    roles.includes("recruiter") ||
    roles.includes("employer") ||
    roles.includes("admin")
  );
}

// ─── Tag helpers ─────────────────────────────────────────────────────────────

export function extractMentions(content: string): string[] {
  const matches = content.match(/@([a-zA-Z0-9_.-]+)/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

export interface FeedTag {
  id: string;
  tagType: "Hashtag" | "Mention";
  tagValue: string;
  position: number;
}

export function buildTagsField(content: string): FeedTag[] {
  const tags: FeedTag[] = [];
  let idx = 0;
  for (const match of content.matchAll(/#([a-zA-Z0-9_]+)/g)) {
    tags.push({ id: crypto.randomUUID(), tagType: "Hashtag", tagValue: match[1].toLowerCase(), position: match.index ?? idx++ });
  }
  for (const match of content.matchAll(/@([a-zA-Z0-9_.-]+)/g)) {
    tags.push({ id: crypto.randomUUID(), tagType: "Mention", tagValue: match[1].toLowerCase(), position: match.index ?? idx++ });
  }
  return tags;
}

export interface FeedMediaItem {
  id: string;
  mediaType: "Video" | "Image";
  mediaUrl: string;
  thumbnailUrl?: string;
  altText?: string;
  displayOrder: number;
}

/** Normalize the composer's `media` array into stored media items. */
export function normalizeMediaItems(raw: unknown): FeedMediaItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: unknown, idx: number) => {
    const m: Record<string, unknown> = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      id: crypto.randomUUID(),
      mediaType: m.mediaType === "Video" ? "Video" : "Image",
      mediaUrl: (m.mediaUrl as string) ?? "",
      thumbnailUrl: (m.thumbnailUrl as string) ?? undefined,
      altText: (m.altText as string) ?? undefined,
      displayOrder: typeof m.displayOrder === "number" ? m.displayOrder : idx,
    };
  });
}
