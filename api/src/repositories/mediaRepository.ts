/**
 * MediaRepository — user-generated-media domain:
 *   • videos              — video resume uploads
 *   • studioVoiceClones   — voice-clone marketplace listings
 *   • studioProjects      — storyboards / generation state
 *   • pitchDecks          — recruiter pitch-deck builder
 *   • pitchDeckCandidates — candidates attached to a deck
 *   • pitchDeckShares     — per-share ACL for decks
 *
 * Grouped because they're all "long-form media the app generates or
 * hosts" with similar storage/visibility semantics.
 */

import { and, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";
import { isNotRenderVariant } from "./renderVariantRepository.js";
import { invalidatePublicVideoFeed } from "../services/studio/public-video-feed.js";

const {
  videos,
  studioVoiceClones,
  studioProjects,
  pitchDecks,
  pitchDeckCandidates,
  pitchDeckShares,
  feedPosts,
  feedPostComments,
} = schema;

export type DbLike = any;

export type VideoRow = typeof videos.$inferSelect;
export type VideoInsert = typeof videos.$inferInsert;
export type StudioVoiceCloneRow = typeof studioVoiceClones.$inferSelect;
export type StudioVoiceCloneInsert = typeof studioVoiceClones.$inferInsert;
export type StudioProjectRow = typeof studioProjects.$inferSelect;
export type StudioProjectInsert = typeof studioProjects.$inferInsert;
export type PitchDeckRow = typeof pitchDecks.$inferSelect;
export type PitchDeckInsert = typeof pitchDecks.$inferInsert;
export type PitchDeckCandidateRow = typeof pitchDeckCandidates.$inferSelect;
export type PitchDeckShareRow = typeof pitchDeckShares.$inferSelect;
export type FeedPostRow = typeof feedPosts.$inferSelect;
export type FeedPostInsert = typeof feedPosts.$inferInsert;
export type FeedPostCommentRow = typeof feedPostComments.$inferSelect;

export interface IMediaRepository {
  // videos
  findVideoById(id: string): Promise<VideoRow | null>;
  findPublicVideosForUser(userId: string): Promise<VideoRow[]>;
  insertVideo(input: VideoInsert): Promise<VideoRow>;
  updateVideoById(id: string, userId: string, patch: Partial<VideoInsert>): Promise<VideoRow | null>;
  deleteVideoById(id: string, userId: string): Promise<boolean>;
  // voice clones
  findVoiceCloneById(id: string): Promise<StudioVoiceCloneRow | null>;
  listPublicVoiceClones(limit?: number): Promise<StudioVoiceCloneRow[]>;
  findVoiceClonesForUser(userId: string): Promise<StudioVoiceCloneRow[]>;
  insertVoiceClone(input: StudioVoiceCloneInsert): Promise<StudioVoiceCloneRow>;
  // studio projects
  findStudioProjectById(id: string): Promise<StudioProjectRow | null>;
  findStudioProjectsForUser(userId: string): Promise<StudioProjectRow[]>;
  insertStudioProject(input: StudioProjectInsert): Promise<StudioProjectRow>;
  updateStudioProjectById(id: string, userId: string, patch: Partial<StudioProjectInsert>): Promise<void>;
  /** The `limit` most-recently-updated projects matching `where`, returned
   *  in ascending `updatedAt` order (oldest of the window first). */
  findStudioProjectsWhere(where: SQL | undefined, limit?: number): Promise<StudioProjectRow[]>;
  /** Slug collision summary for `baseSlug` (excluding `selfProjectId`):
   *  whether the bare slug is taken, and the highest numeric `-N` suffix in use. */
  findProjectSlugCollision(
    baseSlug: string,
    selfProjectId: string | undefined,
  ): Promise<{ baseTaken: boolean; maxSuffix: number | null }>;
  // pitch decks
  findPitchDeckById(id: string): Promise<PitchDeckRow | null>;
  findPitchDecksForCompany(companyId: string): Promise<PitchDeckRow[]>;
  insertPitchDeck(input: PitchDeckInsert): Promise<PitchDeckRow>;
  findPitchDeckCandidates(deckId: string): Promise<PitchDeckCandidateRow[]>;
  findPitchDeckShares(deckId: string): Promise<PitchDeckShareRow[]>;
  // feed posts (user-authored social-feed content)
  findFeedPostsForUser(userId: string, limit?: number): Promise<FeedPostRow[]>;
  insertFeedPost(input: FeedPostInsert): Promise<FeedPostRow>;
  deleteFeedPost(id: string, userId: string): Promise<boolean>;
  /** Newest-first comments on a feed post, capped at `limit` (default 200, max 500). */
  findCommentsForFeedPost(postId: string, limit?: number): Promise<FeedPostCommentRow[]>;
}

export class MediaRepository implements IMediaRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  // ── videos ────────────────────────────────────────────────────────────────

  async findVideoById(id: string): Promise<VideoRow | null> {
    const [row] = await this.db.select().from(videos).where(eq(videos.id, id)).limit(1);
    return (row as VideoRow) ?? null;
  }

  async findPublicVideosForUser(userId: string): Promise<VideoRow[]> {
    return (await this.db
      .select()
      .from(videos)
      .where(and(eq(videos.userId, userId), eq(videos.privacyStatus, "public"), isNotRenderVariant(videos.id)))
      .orderBy(desc(videos.createdAt))) as VideoRow[];
  }

  async insertVideo(input: VideoInsert): Promise<VideoRow> {
    const [row] = await this.db.insert(videos).values(input as any).returning();
    invalidatePublicVideoFeed();
    return row as VideoRow;
  }

  async updateVideoById(id: string, userId: string, patch: Partial<VideoInsert>): Promise<VideoRow | null> {
    const [row] = await this.db
      .update(videos)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(and(eq(videos.id, id), eq(videos.userId, userId)))
      .returning();
    invalidatePublicVideoFeed();
    return (row as VideoRow) ?? null;
  }

  async deleteVideoById(id: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: videos.id })
      .from(videos)
      .where(and(eq(videos.id, id), eq(videos.userId, userId)))
      .limit(1);
    if (!row) return false;
    await this.db.delete(videos).where(and(eq(videos.id, id), eq(videos.userId, userId)));
    invalidatePublicVideoFeed();
    return true;
  }

  // ── voice clones ──────────────────────────────────────────────────────────

  async findVoiceCloneById(id: string): Promise<StudioVoiceCloneRow | null> {
    const [row] = await this.db.select().from(studioVoiceClones).where(eq(studioVoiceClones.id, id)).limit(1);
    return (row as StudioVoiceCloneRow) ?? null;
  }

  async listPublicVoiceClones(limit = 100): Promise<StudioVoiceCloneRow[]> {
    return (await this.db
      .select()
      .from(studioVoiceClones)
      .where(eq(studioVoiceClones.visibility, "public"))
      .orderBy(desc(studioVoiceClones.createdAt))
      .limit(Math.min(500, Math.max(1, limit)))) as StudioVoiceCloneRow[];
  }

  async findVoiceClonesForUser(userId: string): Promise<StudioVoiceCloneRow[]> {
    return (await this.db
      .select()
      .from(studioVoiceClones)
      .where(eq(studioVoiceClones.userId, userId))) as StudioVoiceCloneRow[];
  }

  async insertVoiceClone(input: StudioVoiceCloneInsert): Promise<StudioVoiceCloneRow> {
    const [row] = await this.db.insert(studioVoiceClones).values(input as any).returning();
    return row as StudioVoiceCloneRow;
  }

  // ── studio projects ───────────────────────────────────────────────────────

  async findStudioProjectById(id: string): Promise<StudioProjectRow | null> {
    const [row] = await this.db.select().from(studioProjects).where(eq(studioProjects.id, id)).limit(1);
    return (row as StudioProjectRow) ?? null;
  }

  async findStudioProjectsForUser(userId: string): Promise<StudioProjectRow[]> {
    return (await this.db
      .select()
      .from(studioProjects)
      .where(eq(studioProjects.userId, userId))
      .orderBy(desc(studioProjects.createdAt))) as StudioProjectRow[];
  }

  async insertStudioProject(input: StudioProjectInsert): Promise<StudioProjectRow> {
    const [row] = await this.db.insert(studioProjects).values(input as any).returning();
    return row as StudioProjectRow;
  }

  async updateStudioProjectById(id: string, userId: string, patch: Partial<StudioProjectInsert>): Promise<void> {
    await this.db
      .update(studioProjects)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(and(eq(studioProjects.id, id), eq(studioProjects.userId, userId)));
  }

  // ── pitch decks ───────────────────────────────────────────────────────────

  async findPitchDeckById(id: string): Promise<PitchDeckRow | null> {
    const [row] = await this.db.select().from(pitchDecks).where(eq(pitchDecks.id, id)).limit(1);
    return (row as PitchDeckRow) ?? null;
  }

  async findPitchDecksForCompany(companyId: string): Promise<PitchDeckRow[]> {
    return (await this.db
      .select()
      .from(pitchDecks)
      .where(eq(pitchDecks.companyId, companyId))
      .orderBy(desc(pitchDecks.createdAt))) as PitchDeckRow[];
  }

  async insertPitchDeck(input: PitchDeckInsert): Promise<PitchDeckRow> {
    const [row] = await this.db.insert(pitchDecks).values(input as any).returning();
    return row as PitchDeckRow;
  }

  async findPitchDeckCandidates(deckId: string): Promise<PitchDeckCandidateRow[]> {
    return (await this.db
      .select()
      .from(pitchDeckCandidates)
      .where(eq(pitchDeckCandidates.deckId, deckId))) as PitchDeckCandidateRow[];
  }

  async findPitchDeckShares(deckId: string): Promise<PitchDeckShareRow[]> {
    return (await this.db
      .select()
      .from(pitchDeckShares)
      .where(eq(pitchDeckShares.deckId, deckId))) as PitchDeckShareRow[];
  }

  async findStudioProjectsWhere(where: SQL | undefined, limit = 500): Promise<StudioProjectRow[]> {
    const rows = (await this.db
      .select()
      .from(studioProjects)
      .where(where)
      .orderBy(desc(studioProjects.updatedAt))
      .limit(Math.min(1000, Math.max(1, limit)))) as StudioProjectRow[];
    return rows.reverse();
  }

  async findProjectSlugCollision(
    baseSlug: string,
    selfProjectId: string | undefined,
  ): Promise<{ baseTaken: boolean; maxSuffix: number | null }> {
    // `LIKE 'literal%'` rides the slug btree index; the regex then keeps
    // only `<base>-<digits>` siblings so one aggregate row answers it.
    const escaped = baseSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const suffixPattern = `^${escaped}-([0-9]{1,9})$`;
    const prefixMatch = sql`${studioProjects.slug} LIKE ${`${baseSlug}%`}`;
    const [row] = (await this.db
      .select({
        baseTaken: sql<boolean | null>`bool_or(${studioProjects.slug} = ${baseSlug})`,
        maxSuffix: sql<number | null>`max((substring(${studioProjects.slug} from ${suffixPattern}))::int)`,
      })
      .from(studioProjects)
      .where(selfProjectId ? and(prefixMatch, ne(studioProjects.id, selfProjectId)) : prefixMatch)) as Array<{
      baseTaken: boolean | null;
      maxSuffix: number | string | null;
    }>;
    return {
      baseTaken: row?.baseTaken === true,
      maxSuffix: row?.maxSuffix == null ? null : Number(row.maxSuffix),
    };
  }

  // ── feed posts ────────────────────────────────────────────────────────────

  async findFeedPostsForUser(userId: string, limit = 50): Promise<FeedPostRow[]> {
    return (await this.db
      .select()
      .from(feedPosts)
      .where(eq(feedPosts.userId, userId))
      .orderBy(desc(feedPosts.createdAt))
      .limit(Math.min(200, Math.max(1, limit)))) as FeedPostRow[];
  }

  async findCommentsForFeedPost(postId: string, limit = 200): Promise<FeedPostCommentRow[]> {
    return (await this.db
      .select()
      .from(feedPostComments)
      .where(eq(feedPostComments.feedPostId, postId))
      .orderBy(desc(feedPostComments.createdAt))
      .limit(Math.min(500, Math.max(1, limit)))) as FeedPostCommentRow[];
  }

  async insertFeedPost(input: FeedPostInsert): Promise<FeedPostRow> {
    const [row] = await this.db.insert(feedPosts).values(input as any).returning();
    return row as FeedPostRow;
  }

  async deleteFeedPost(id: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: feedPosts.id })
      .from(feedPosts)
      .where(and(eq(feedPosts.id, id), eq(feedPosts.userId, userId)))
      .limit(1);
    if (!row) return false;
    await this.db.delete(feedPosts).where(and(eq(feedPosts.id, id), eq(feedPosts.userId, userId)));
    return true;
  }
}
