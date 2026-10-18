/**
 * Feed posts use cases — timeline listing/search, single-post read (with
 * impression tracking), create / update / delete, reshare, and reporting.
 * Return plain data; throw DomainError on rule violations.
 */

import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  deletePost,
  findPostById,
  findPostOwner,
  findVisiblePost,
  insertPost,
  listVisiblePosts,
  searchVisiblePosts,
  updatePost,
  type FeedDb,
  type FeedPostRecord,
  type FeedViewer,
} from "../../repositories/feedPostsRepository.js";
import { ContentReportsRepository } from "../../repositories/contentReportsRepository.js";
import { REPORT_REASONS, type ReportReason } from "../../../../shared/moderation.js";
import { recordArtifactView } from "../analytics/artifactView.js";
import { submitContentReport } from "../moderation/moderationReports.js";
import { buildPostDtos, type FeedPostDto } from "./feedDtos.js";
import { createMentionNotifications } from "./feedNotifications.js";
import {
  buildTagsField,
  normalizeMediaItems,
  normalizePrivacy,
  resolveKind,
  type FeedKind,
  type FeedPrivacy,
} from "./feedPostPolicy.js";
import { resolvePostLinkFields } from "./postLinkService.js";

export type WaitUntil = (promise: Promise<unknown>) => void;
export type { FeedViewer };

type Body = Record<string, unknown>;

const postNotFound = () => new DomainError(404, "NOT_FOUND", "Post not found");
const notYourPost = () => new DomainError(403, "FORBIDDEN", "Not your post");

async function toDto(post: FeedPostRecord, viewerId: string, db: FeedDb): Promise<FeedPostDto> {
  const [dto] = await buildPostDtos([post], viewerId, db);
  return dto;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listFeedPosts(
  viewer: FeedViewer,
  opts: { tag: string; pageNumber: number; pageSize: number },
): Promise<{ dtos: FeedPostDto[]; total: number; offset: number }> {
  const db = getDb();
  const offset = (opts.pageNumber - 1) * opts.pageSize;
  const { total, rows } = await listVisiblePosts(db, viewer, { tag: opts.tag, limit: opts.pageSize, offset });
  const dtos = await buildPostDtos(rows, viewer.userId, db);
  return { dtos, total, offset };
}

export async function searchFeedPosts(
  viewer: FeedViewer,
  opts: { searchTerm: string; pageNumber: number; pageSize: number },
): Promise<FeedPostDto[]> {
  const db = getDb();
  const offset = (opts.pageNumber - 1) * opts.pageSize;
  const rows = await searchVisiblePosts(db, viewer, { searchTerm: opts.searchTerm, limit: opts.pageSize, offset });
  return buildPostDtos(rows, viewer.userId, db);
}

export interface ViewContext {
  ipCountry: string | null;
  referrer: string | null;
  waitUntil: WaitUntil;
}

/** A single visible post. Records an impression (polymorphic artifact_views,
 *  kind 'post') fire-and-forget; the helper no-ops when the viewer IS the
 *  author, so an owner reading their own post never inflates their stats. */
export async function getFeedPost(viewer: FeedViewer, postId: string, view: ViewContext): Promise<FeedPostDto> {
  const db = getDb();
  const post = await findVisiblePost(db, postId, viewer);
  if (!post) throw postNotFound();

  view.waitUntil(
    recordArtifactView({
      artifactKind: "post",
      artifactId: post.id,
      ownerUserId: post.userId,
      viewerId: viewer.userId || null,
      ipCountry: view.ipCountry,
      referrer: view.referrer,
    }),
  );

  return toDto(post, viewer.userId, db);
}

// ─── Writes ──────────────────────────────────────────────────────────────────

/** Create a post. `afterCreate` runs (awaited) after the row exists and
 *  before the DTO is built — the route uses it for the gamification award. */
export async function createFeedPost(
  userId: string,
  body: Body,
  hooks: { waitUntil: WaitUntil; afterCreate?: (postId: string) => Promise<void> },
): Promise<FeedPostDto> {
  const db = getDb();
  const content = typeof body.content === "string" ? body.content : "";
  const mediaItems = normalizeMediaItems(body.media);

  const post = await insertPost(db, {
    userId,
    content,
    kind: resolveKind(body.kind, mediaItems),
    ...(await resolvePostLinkFields(body.linkUrl, { waitUntil: hooks.waitUntil })),
    privacy: normalizePrivacy(body.privacy, "Public"),
    media: mediaItems,
    tags: buildTagsField(content),
  });

  // Mention notifications (fire-and-forget). The author lookup happens
  // inside `createMentionNotifications` via `resolveActor`.
  hooks.waitUntil(createMentionNotifications(content, post.id, userId, db));

  if (hooks.afterCreate) await hooks.afterCreate(post.id);

  return toDto(post, userId, db);
}

/** Repost (optionally with a quote). A reshare is a new feed_posts row whose
 *  repost_of_id points at the ROOT original — keeps the embed one level deep
 *  and the reshare count anchored on the original. The original must be
 *  visible to the resharer. */
export async function reshareFeedPost(
  viewer: FeedViewer,
  originalId: string,
  body: Body,
  waitUntil: WaitUntil,
): Promise<FeedPostDto> {
  const db = getDb();
  const original = await findVisiblePost(db, originalId, viewer);
  if (!original) throw postNotFound();

  const rootId = original.repostOfId ?? original.id;
  const content = typeof body.content === "string" ? body.content : "";

  const post = await insertPost(db, {
    userId: viewer.userId,
    content,
    kind: "text",
    privacy: normalizePrivacy(body.privacy, "Public"),
    media: [],
    tags: buildTagsField(content),
    repostOfId: rootId,
  });

  if (content) {
    waitUntil(createMentionNotifications(content, post.id, viewer.userId, db));
  }

  return toDto(post, viewer.userId, db);
}

export async function updateFeedPost(userId: string, postId: string, body: Body): Promise<FeedPostDto> {
  const db = getDb();
  const existing = await findPostById(db, postId);
  if (!existing) throw postNotFound();
  if (existing.userId !== userId) throw notYourPost();

  const newContent = typeof body.content === "string" ? body.content : existing.content;
  const updated = await updatePost(db, postId, {
    content: newContent,
    kind: body.kind !== undefined
      ? resolveKind(body.kind, (existing.media ?? []) as Array<{ mediaType?: string }>, existing.kind as FeedKind)
      : existing.kind,
    privacy: body.privacy !== undefined
      ? normalizePrivacy(body.privacy, existing.privacy as FeedPrivacy)
      : existing.privacy,
    tags: buildTagsField(newContent),
    updatedAt: new Date(),
  });

  return toDto(updated, userId, db);
}

export async function deleteFeedPost(userId: string, postId: string): Promise<true> {
  const db = getDb();
  const existing = await findPostOwner(db, postId);
  if (!existing) throw postNotFound();
  if (existing.userId !== userId) throw notYourPost();
  await deletePost(db, postId);
  return true;
}

/** Report a post. Idempotent per (post, user): `created` is false when the
 *  viewer already reported it. Files a `content_reports` row (entity_type
 *  'feed_post') through the moderation service, so it lands in the
 *  /api/moderation/reports queue. A free-text reason outside REPORT_REASONS
 *  is filed as 'other' with the original text kept in the notes. */
export async function reportFeedPost(
  userId: string,
  postId: string,
  body: Body,
): Promise<{ created: boolean }> {
  const rawReason = typeof body.reason === "string" ? body.reason : "other";
  const details = typeof body.details === "string" ? body.details : null;
  const db = getDb();

  const existing = await findPostOwner(db, postId);
  if (!existing) throw postNotFound();

  if (await new ContentReportsRepository(db).hasReported(userId, "feed_post", postId)) {
    return { created: false };
  }

  const reason: ReportReason = isReportReason(rawReason) ? rawReason : "other";
  const notes = [reason === rawReason ? null : `Reason: ${rawReason}`, details]
    .filter((part): part is string => Boolean(part))
    .join("\n");
  const filed = await submitContentReport({
    reporterId: userId,
    entityType: "feed_post",
    entityId: postId,
    reason,
    notes: notes || null,
  });
  return { created: filed.created };
}

function isReportReason(value: string): value is ReportReason {
  return (REPORT_REASONS as readonly string[]).includes(value);
}
