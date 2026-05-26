/**
 * ResumeRepository — the ONLY place Drizzle talks to the resume tables.
 *
 * Layering rule: Routes → Services → Repository. Nothing outside this
 * file should import `schema.resumeInformation`, `schema.watchedResumes`,
 * or `schema.resumeViews` for reads/writes. Services call these methods;
 * the repo has zero business logic, zero validation — it is a typed
 * Drizzle wrapper and nothing more.
 *
 *   • Reads: finders + counters for the list/detail endpoints.
 *   • Writes: the full CRUD plus a handful of multi-row mutations
 *     (flipSingletonFlag, clearParentIdForChildren) that can't be
 *     expressed as a single-row update.
 *   • Watched / views: colocated here because they're per-resume
 *     cross-cuts the list endpoints already batch alongside resume
 *     lookups; splitting into three repos would force services to
 *     juggle three handles for one page render.
 *
 * The constructor takes a Drizzle-compatible handle. The production
 * code passes the real `getDb()` client; tests pass the fake-db shim
 * from `handlers/__testing__/fake-db.ts`. Because the repo's method
 * surface is what services depend on, tests can equivalently pass a
 * hand-rolled mock implementing only the methods a given service uses.
 */

import { and, asc, desc, eq, gte, ilike, inArray, lt, ne, sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import { isUuid } from "../../../shared/value-types.js";

const { resumeInformation, watchedResumes, resumeViews } = schema;

// Drizzle handle. Typed `any` because the fake-db harness implements a
// minimal shim, not the full `ReturnType<typeof getDb>` surface; the
// repo exists precisely so callers don't need to care which is which.
export type DbLike = any;

// ─── Row types ────────────────────────────────────────────────────────────────

export type ResumeRow = typeof resumeInformation.$inferSelect;
export type ResumeInsert = typeof resumeInformation.$inferInsert;

/** Columns services may patch on a resume row. Intentionally a subset
 *  of `resumeInformation.$inferInsert` — `id`, `userId`, `createdAt` are
 *  immutable post-insert. `updatedAt` is always set by the repo. */
export interface ResumePatch {
  title?: string;
  slug?: string | null;
  content?: Record<string, unknown>;
  status?: string;
  templateId?: string | null;
  isMaster?: boolean;
  isActive?: boolean;
  parentId?: string | null;
  privacyLevel?: number;
  diffPercent?: number | null;
  sentimentScore?: number | null;
  metaResumeId?: string | null;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

// ─── Repository interface (DIP) ───────────────────────────────────────────────

/** Public surface of `ResumeRepository`. Services depend on this interface,
 *  not the concrete class, so production code can inject the live Drizzle-
 *  backed implementation while tests can pass a hand-rolled mock that
 *  implements only the methods the test exercises (ISP). */
export interface IResumeRepository {
  // reads
  findByIdOrSlug(idOrSlug: string): Promise<ResumeRow | null>;
  findById(id: string): Promise<ResumeRow | null>;
  findByIdForOwner(id: string, ownerId: string): Promise<ResumeRow | null>;
  findAllForOwner(ownerId: string): Promise<ResumeRow[]>;
  findChildrenForOwner(parentId: string, ownerId: string): Promise<ResumeRow[]>;
  findBySlug(slug: string, excludeId?: string | null): Promise<ResumeRow | null>;
  findPublicPaginated(opts?: PaginationOptions): Promise<ResumeRow[]>;
  searchPublicByTitle(term: string, limit?: number): Promise<ResumeRow[]>;
  countAll(): Promise<number>;
  countCreatedSince(since: Date): Promise<number>;
  countCreatedInRange(from: Date, to: Date): Promise<number>;
  countByOwner(ownerId: string): Promise<number>;
  countByOwnerBulk(userIds: string[]): Promise<Map<string, number>>;
  // writes
  insertOne(input: ResumeInsert): Promise<ResumeRow>;
  updateByIdForOwner(
    id: string,
    ownerId: string,
    patch: ResumePatch,
    opts?: { touchUpdatedAt?: boolean },
  ): Promise<ResumeRow | null>;
  updateSentimentScoreForOwner(id: string, ownerId: string, sentimentScore: number): Promise<void>;
  updateScoresForOwner(id: string, ownerId: string, scores: Record<string, number>): Promise<void>;
  updateDiffPercent(id: string, ownerId: string, diffPercent: number | null): Promise<void>;
  clearSingletonFlagForOwner(ownerId: string, field: "isMaster" | "isActive"): Promise<void>;
  clearParentIdForChildren(parentId: string, ownerId: string): Promise<void>;
  deleteByIdForOwner(id: string, ownerId: string): Promise<boolean>;
  // watched
  hasWatched(viewerId: string, resumeId: string): Promise<boolean>;
  addWatchIfMissing(viewerId: string, resumeId: string): Promise<void>;
  removeWatch(viewerId: string, resumeId: string): Promise<void>;
  watchedIdsForViewer(viewerId: string, resumeIds: string[]): Promise<Set<string>>;
  // views
  countViews(resumeId: string): Promise<number>;
  countViewsBulk(resumeIds: string[]): Promise<Map<string, number>>;
  insertView(row: {
    resumeId: string;
    viewerId: string | null;
    ipHash?: string | null;
    referrer?: string | null;
    userAgent?: string | null;
  }): Promise<void>;
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class ResumeRepository implements IResumeRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  // ── Reads ──────────────────────────────────────────────────────────────────

  /** Find by primary key (or slug if `idOrSlug` is non-UUID). Used by
   *  public GET /api/resumes/:id which accepts either form. */
  async findByIdOrSlug(idOrSlug: string): Promise<ResumeRow | null> {
    const condition = isUuid(idOrSlug)
      ? eq(resumeInformation.id, idOrSlug)
      : eq(resumeInformation.slug, idOrSlug);
    const [row] = await this.db
      .select()
      .from(resumeInformation)
      .where(condition)
      .limit(1);
    return (row as ResumeRow) ?? null;
  }

  async findById(id: string): Promise<ResumeRow | null> {
    const [row] = await this.db
      .select()
      .from(resumeInformation)
      .where(eq(resumeInformation.id, id))
      .limit(1);
    return (row as ResumeRow) ?? null;
  }

  /** Scoped single-row read — every owner-gated handler goes through here
   *  so the `userId` filter is impossible to forget. */
  async findByIdForOwner(id: string, ownerId: string): Promise<ResumeRow | null> {
    const [row] = await this.db
      .select()
      .from(resumeInformation)
      .where(and(eq(resumeInformation.id, id), eq(resumeInformation.userId, ownerId)))
      .limit(1);
    return (row as ResumeRow) ?? null;
  }

  /** Return every resume owned by `ownerId`. Used by list/mastergroups
   *  handlers — pagination belongs one layer up (these arrays are
   *  typically small enough that the caller projects into the shape it
   *  wants rather than querying twice). */
  async findAllForOwner(
    ownerId: string,
    opts: { includeArchived?: boolean } = {},
  ): Promise<ResumeRow[]> {
    const whereClause = opts.includeArchived
      ? eq(resumeInformation.userId, ownerId)
      : and(
          eq(resumeInformation.userId, ownerId),
          sql`${resumeInformation.archivedAt} IS NULL`,
        );
    return (await this.db
      .select()
      .from(resumeInformation)
      .where(whereClause)
      .orderBy(asc(resumeInformation.updatedAt))) as ResumeRow[];
  }

  async findChildrenForOwner(parentId: string, ownerId: string): Promise<ResumeRow[]> {
    return (await this.db
      .select()
      .from(resumeInformation)
      .where(and(
        eq(resumeInformation.parentId, parentId),
        eq(resumeInformation.userId, ownerId),
      ))) as ResumeRow[];
  }

  /** Find a row whose slug matches. `excludeId` lets editing-a-resume
   *  collision checks skip the row being edited. Uniqueness is GLOBAL
   *  (not per-user) — public slug URLs resolve via `limit(1)` across the
   *  whole table. */
  async findBySlug(slug: string, excludeId?: string | null): Promise<ResumeRow | null> {
    const condition = excludeId
      ? and(eq(resumeInformation.slug, slug), ne(resumeInformation.id, excludeId))
      : eq(resumeInformation.slug, slug);
    const [row] = await this.db
      .select()
      .from(resumeInformation)
      .where(condition)
      .limit(1);
    return (row as ResumeRow) ?? null;
  }

  async findPublicPaginated(
    { page = 1, limit = 20 }: PaginationOptions = {},
  ): Promise<ResumeRow[]> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    return (await this.db
      .select()
      .from(resumeInformation)
      .where(eq(resumeInformation.privacyLevel, 0))
      .orderBy(desc(resumeInformation.updatedAt))
      .limit(safeLimit)
      .offset((safePage - 1) * safeLimit)) as ResumeRow[];
  }

  /** Public-only title search for the global `/api/search` endpoint.
   *  `term` is applied as a case-insensitive substring match on `title`;
   *  pass an empty string to get the most-recent public resumes. Ordered
   *  newest-first and hard-capped at `limit` rows. */
  async searchPublicByTitle(term: string, limit = 100): Promise<ResumeRow[]> {
    const safeLimit = Math.min(500, Math.max(1, limit));
    const publicOnly = eq(resumeInformation.privacyLevel, 0);
    const where = term
      ? and(publicOnly, ilike(resumeInformation.title, `%${term}%`))
      : publicOnly;
    return (await this.db
      .select()
      .from(resumeInformation)
      .where(where)
      .orderBy(desc(resumeInformation.createdAt))
      .limit(safeLimit)) as ResumeRow[];
  }

  /** Count of resumes owned by a user. Used by first-upload auto-master
   *  promotion and the /admin/users "Resumes" column. */
  async countByOwner(ownerId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(resumeInformation)
      .where(eq(resumeInformation.userId, ownerId));
    return Number(row?.n ?? 0);
  }

  /** Total row count — drives the admin dashboard metric. */
  async countAll(): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(resumeInformation);
    return Number(row?.n ?? 0);
  }

  /** Rows created on or after `since`. Used by the admin dashboard for
   *  the "resumes added in the last 30 days" widget. */
  async countCreatedSince(since: Date): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(resumeInformation)
      .where(gte(resumeInformation.createdAt, since));
    return Number(row?.n ?? 0);
  }

  /** Rows created in the half-open interval `[from, to)`. Drives the
   *  admin dashboard's 30-day sparkline — one call per day. */
  async countCreatedInRange(from: Date, to: Date): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(resumeInformation)
      .where(and(
        gte(resumeInformation.createdAt, from),
        lt(resumeInformation.createdAt, to),
      ));
    return Number(row?.n ?? 0);
  }

  /** Grouped count — one entry per user. Drives the /admin/users list
   *  column; batches the per-user count into a single query. */
  async countByOwnerBulk(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        userId: resumeInformation.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(resumeInformation)
      .where(inArray(resumeInformation.userId, userIds))
      .groupBy(resumeInformation.userId);
    return new Map(
      (rows as Array<{ userId: string; count: number }>).map((r) => [r.userId, Number(r.count)]),
    );
  }

  // ── Writes ─────────────────────────────────────────────────────────────────

  /** Insert + return the created row. Callers that touch `content` must
   *  validate upstream via `healAndValidateContent` — the repo does NOT
   *  re-validate (keeps this layer side-effect-free and testable). */
  async insertOne(input: ResumeInsert): Promise<ResumeRow> {
    const [created] = await this.db
      .insert(resumeInformation)
      .values(input as any)
      .returning();
    return created as ResumeRow;
  }

  /** Owner-scoped patch. Bumps `updatedAt` automatically so callers
   *  don't need to remember. Pass `{ touchUpdatedAt: false }` for schema
   *  migrations / heal passes where bumping would churn list ordering
   *  without reflecting a real user edit. Returns the updated row, or
   *  null when the (id, ownerId) pair didn't match anything. */
  async updateByIdForOwner(
    id: string,
    ownerId: string,
    patch: ResumePatch,
    opts: { touchUpdatedAt?: boolean } = {},
  ): Promise<ResumeRow | null> {
    const values = opts.touchUpdatedAt === false
      ? { ...patch }
      : { ...patch, updatedAt: this.now() };
    const [updated] = await this.db
      .update(resumeInformation)
      .set(values as any)
      .where(and(eq(resumeInformation.id, id), eq(resumeInformation.userId, ownerId)))
      .returning();
    return (updated as ResumeRow) ?? null;
  }

  /** Fire-and-forget sentiment persist. Separate method (rather than
   *  `updateByIdForOwner`) because callers use it inside a try/catch —
   *  a sentiment write failure shouldn't fail the whole score endpoint. */
  async updateSentimentScoreForOwner(
    id: string,
    ownerId: string,
    sentimentScore: number,
  ): Promise<void> {
    await this.db
      .update(resumeInformation)
      .set({ sentimentScore, updatedAt: this.now() } as any)
      .where(and(eq(resumeInformation.id, id), eq(resumeInformation.userId, ownerId)));
  }

  /** Merge-write the analytical scores blob (overall / ats / content /
   *  keyword / format / impact). Sentiment lives on its own column and
   *  is NOT touched here. Callers wrap this in a try/catch — a scores
   *  write failure must not fail the whole scorer/optimizer response. */
  async updateScoresForOwner(
    id: string,
    ownerId: string,
    scores: Record<string, number>,
  ): Promise<void> {
    await this.db
      .update(resumeInformation)
      .set({ scores, updatedAt: this.now() } as any)
      .where(and(eq(resumeInformation.id, id), eq(resumeInformation.userId, ownerId)));
  }

  /** Write a fresh diff percent on a single row without bumping
   *  `updatedAt`. Used by `refreshDiffPercentFor` — bumping would churn
   *  list ordering every time a sibling resume was edited. */
  async updateDiffPercent(
    id: string,
    ownerId: string,
    diffPercent: number | null,
  ): Promise<void> {
    await this.db
      .update(resumeInformation)
      .set({ diffPercent } as any)
      .where(and(eq(resumeInformation.id, id), eq(resumeInformation.userId, ownerId)));
  }

  /** Clear a "singleton flag" (isMaster / isActive) across every resume
   *  owned by `ownerId`. Paired with a subsequent `updateByIdForOwner`
   *  that sets the flag to true on the target row — the two together
   *  enforce "at most one row has this flag set". */
  async clearSingletonFlagForOwner(
    ownerId: string,
    field: "isMaster" | "isActive",
  ): Promise<void> {
    await this.db
      .update(resumeInformation)
      .set({ [field]: false, updatedAt: this.now() } as any)
      .where(eq(resumeInformation.userId, ownerId));
  }

  /** Unparent every variant of a master that's about to be deleted. The
   *  variants become standalone rows rather than orphaned FKs. Owner-
   *  scoped so an admin deleting one user's master doesn't accidentally
   *  touch another user's. */
  async clearParentIdForChildren(parentId: string, ownerId: string): Promise<void> {
    await this.db
      .update(resumeInformation)
      .set({ parentId: null, updatedAt: this.now() } as any)
      .where(and(
        eq(resumeInformation.parentId, parentId),
        eq(resumeInformation.userId, ownerId),
      ));
  }

  /** Hard delete. Returns true when a row was deleted (for 404 discrimination
   *  at the service layer). Check-then-delete rather than DELETE … RETURNING
   *  because the test fake's delete doesn't support a returning clause; the
   *  extra round-trip is fine given deletes are rare and owner-scoped. */
  async deleteByIdForOwner(id: string, ownerId: string): Promise<boolean> {
    const existing = await this.findByIdForOwner(id, ownerId);
    if (!existing) return false;
    await this.db
      .delete(resumeInformation)
      .where(and(eq(resumeInformation.id, id), eq(resumeInformation.userId, ownerId)));
    return true;
  }

  // ── Watched resumes ────────────────────────────────────────────────────────

  async hasWatched(viewerId: string, resumeId: string): Promise<boolean> {
    const [existing] = await this.db
      .select({ id: watchedResumes.id })
      .from(watchedResumes)
      .where(and(
        eq(watchedResumes.viewerId, viewerId),
        eq(watchedResumes.resumeId, resumeId),
      ))
      .limit(1);
    return Boolean(existing);
  }

  /** Idempotent watch-add. A duplicate `viewerId`+`resumeId` insert
   *  would violate the unique index (`watched_resumes_viewer_resume_unique`)
   *  so callers who re-POST /watch/:id get a no-op instead of 500. */
  async addWatchIfMissing(viewerId: string, resumeId: string): Promise<void> {
    if (await this.hasWatched(viewerId, resumeId)) return;
    await this.db
      .insert(watchedResumes)
      .values({ viewerId, resumeId } as any);
  }

  async removeWatch(viewerId: string, resumeId: string): Promise<void> {
    await this.db
      .delete(watchedResumes)
      .where(and(
        eq(watchedResumes.viewerId, viewerId),
        eq(watchedResumes.resumeId, resumeId),
      ));
  }

  /** Batched watch lookup. Returns the set of `resumeId`s the viewer
   *  has watched, restricted to the provided ids. List endpoints call
   *  this once per page render instead of N round-trips. */
  async watchedIdsForViewer(
    viewerId: string,
    resumeIds: string[],
  ): Promise<Set<string>> {
    if (resumeIds.length === 0) return new Set();
    const rows = await this.db
      .select({ resumeId: watchedResumes.resumeId })
      .from(watchedResumes)
      .where(and(
        eq(watchedResumes.viewerId, viewerId),
        inArray(watchedResumes.resumeId, resumeIds),
      ));
    return new Set((rows as Array<{ resumeId: string }>).map((r) => r.resumeId));
  }

  // ── Resume views ───────────────────────────────────────────────────────────

  async countViews(resumeId: string): Promise<number> {
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(resumeViews)
      .where(eq(resumeViews.resumeId, resumeId));
    return Number(row?.c ?? 0);
  }

  async countViewsBulk(resumeIds: string[]): Promise<Map<string, number>> {
    if (resumeIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        resumeId: resumeViews.resumeId,
        c: sql<number>`count(*)::int`,
      })
      .from(resumeViews)
      .where(inArray(resumeViews.resumeId, resumeIds))
      .groupBy(resumeViews.resumeId);
    return new Map(
      (rows as Array<{ resumeId: string; c: number }>).map((r) => [r.resumeId, Number(r.c)]),
    );
  }

  /** Log a single view. Callers must skip owner self-views (see the
   *  service layer's `recordResumeView`) — the repo writes whatever it's
   *  told. */
  async insertView(row: {
    resumeId: string;
    viewerId: string | null;
    ipHash?: string | null;
    referrer?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    await this.db.insert(resumeViews).values({
      resumeId: row.resumeId,
      viewerId: row.viewerId,
      ipHash: row.ipHash ?? null,
      referrer: row.referrer ?? null,
      userAgent: row.userAgent ?? null,
    } as any);
  }
}
