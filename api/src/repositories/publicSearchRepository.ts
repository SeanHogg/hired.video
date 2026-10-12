/**
 * PublicSearchRepository — the Drizzle reads behind the anonymous unified
 * search (`GET /api/search/public`). One method per searchable kind; each
 * applies that kind's public-visibility gate, the free-text match, and the
 * optional entity-id allowlist (geo / audience), newest-first, capped at
 * 100 rows. No business logic — the PublicSearchService decides which
 * kinds run and how the results merge.
 *
 * Public résumés are NOT here: they go through
 * ResumeRepository.searchPublicByTitle so résumé-table access stays at one
 * seam.
 */

import { and, desc, eq, ilike, inArray, notInArray, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { isNotRenderVariant } from "./renderVariantRepository.js";
import { schema, type getDb } from "../db/index.js";
import { NON_CANDIDATE_ROLES } from "../../../shared/user-roles.js";

const { companyProfiles, users, userProfiles, studioVoiceClones, studioTemplates, videos, articles, scheduledEvents, courses } = schema;

type DbHandle = ReturnType<typeof getDb>;

// ─── Row types ──────────────────────────────────────────────────────────────

export type CompanyRow = typeof companyProfiles.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type UserProfileRow = typeof userProfiles.$inferSelect;
export type VoiceCloneRow = typeof studioVoiceClones.$inferSelect;
export type StudioTemplateRow = typeof studioTemplates.$inferSelect;
export type ArticleRow = typeof articles.$inferSelect;
export type CourseRow = typeof courses.$inferSelect;
export type VideoRow = typeof videos.$inferSelect;
export type ScheduledEventRow = typeof scheduledEvents.$inferSelect;

/** Every kind returns at most this many rows into the in-memory merge. */
const PER_KIND_LIMIT = 100;

/** `null` = no allowlist filter; a non-empty array = intersect with it. An
 *  empty array never reaches the repo — the service short-circuits it. */
export type EntityAllowlist = string[] | null;

/** Intersects `col` with the allowlist when set, else `undefined`. */
function allowClause(col: AnyColumn, allow: EntityAllowlist): SQL | undefined {
  return allow !== null && allow.length > 0 ? inArray(col, allow) : undefined;
}

/** Case-insensitive substring match on either column. */
function matchEither(search: string, a: AnyColumn, b: AnyColumn): SQL | undefined {
  return or(ilike(a, `%${search}%`), ilike(b, `%${search}%`));
}

/** Gate + optional search match + optional allowlist, as a WHERE list. */
function whereParts(gate: Array<SQL | undefined>, search: SQL | undefined, allow: SQL | undefined): Array<SQL | undefined> {
  const parts = [...gate];
  if (search) parts.push(search);
  if (allow) parts.push(allow);
  return parts;
}

export interface PeopleSearchRow {
  user: UserRow;
  profile: UserProfileRow | null;
}

export interface MediaSearchRow {
  video: VideoRow;
  ownerName: string | null;
}

export interface TemplateSearchOptions {
  /** When set, only templates owned by this company (first-party filter). */
  companyId: string | null;
}

export class PublicSearchRepository {
  constructor(private readonly db: DbHandle) {}

  /** Active company profiles only (soft-deleted / hidden stay out). */
  async searchCompanies(search: string, allow: EntityAllowlist): Promise<CompanyRow[]> {
    const parts = whereParts(
      [eq(companyProfiles.isActive, true)],
      search ? matchEither(search, companyProfiles.name, companyProfiles.description) : undefined,
      allowClause(companyProfiles.id, allow),
    );
    return this.db
      .select()
      .from(companyProfiles)
      .where(and(...parts))
      .orderBy(desc(companyProfiles.createdAt))
      .limit(PER_KIND_LIMIT);
  }

  /** Public, email-verified candidates. Users without a profile row are
   *  excluded (the profile enforces visibility); unverified signups (a spam
   *  vector) stay out until they prove the address. */
  async searchPeople(search: string, allow: EntityAllowlist): Promise<PeopleSearchRow[]> {
    const visibility = and(
      eq(userProfiles.profileVisibility, "public"),
      eq(users.emailVerified, true),
      // Exclude workforce members + platform staff from candidate search.
      // Same SSoT used by /api/users/public (#1407, DRY rule).
      notInArray(users.role, NON_CANDIDATE_ROLES as unknown as string[]),
      // Confidential search mode (#1627) — fail-closed exclusion from the
      // anonymous public directory for execs who can't be seen job-hunting.
      eq(userProfiles.confidentialMode, false),
    );
    // user_profile content_locations key on user_id (= users.id), matching
    // how migration 0109 backfilled user_profiles.user_id.
    const parts = whereParts(
      [visibility],
      search ? matchEither(search, users.name, users.email) : undefined,
      allowClause(users.id, allow),
    );
    return this.db
      .select({ user: users, profile: userProfiles })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(...parts))
      .orderBy(desc(users.createdAt))
      .limit(PER_KIND_LIMIT);
  }

  /** Voice marketplace listings — public clones only. */
  async searchVoices(search: string, allow: EntityAllowlist): Promise<VoiceCloneRow[]> {
    const parts = whereParts(
      [eq(studioVoiceClones.visibility, "public")],
      search ? matchEither(search, studioVoiceClones.name, studioVoiceClones.description) : undefined,
      allowClause(studioVoiceClones.id, allow),
    );
    return this.db
      .select()
      .from(studioVoiceClones)
      .where(and(...parts))
      .orderBy(desc(studioVoiceClones.createdAt))
      .limit(PER_KIND_LIMIT);
  }

  /** Studio template marketplace — public templates, most recently
   *  published first. Selects every column, so `media_kind` and
   *  `document_kind` (what the template makes) come back on each row. */
  async searchTemplates(search: string, allow: EntityAllowlist, opts: TemplateSearchOptions): Promise<StudioTemplateRow[]> {
    const parts: Array<SQL | undefined> = [eq(studioTemplates.visibility, "public")];
    if (search) parts.push(matchEither(search, studioTemplates.name, studioTemplates.description));
    if (opts.companyId) parts.push(eq(studioTemplates.companyId, opts.companyId));
    const allowCl = allowClause(studioTemplates.id, allow);
    if (allowCl) parts.push(allowCl);
    const where = parts.length === 1 ? parts[0] : and(...parts);
    return this.db
      .select()
      .from(studioTemplates)
      .where(where)
      .orderBy(desc(studioTemplates.publishedAt))
      .limit(PER_KIND_LIMIT);
  }

  /** Public video résumés with their owner's name. */
  async searchMedia(search: string, allow: EntityAllowlist): Promise<MediaSearchRow[]> {
    const parts = whereParts(
      [eq(videos.privacyStatus, "public"), isNotRenderVariant(videos.id)],
      search ? matchEither(search, videos.title, videos.description) : undefined,
      allowClause(videos.id, allow),
    );
    return this.db
      .select({ video: videos, ownerName: users.name })
      .from(videos)
      .innerJoin(users, eq(videos.userId, users.id))
      .where(and(...parts))
      .orderBy(desc(videos.createdAt))
      .limit(PER_KIND_LIMIT);
  }

  /** Creator-authored published articles. */
  async searchArticles(search: string, allow: EntityAllowlist): Promise<ArticleRow[]> {
    const parts = whereParts(
      [eq(articles.status, "published")],
      search ? matchEither(search, articles.title, articles.summary) : undefined,
      allowClause(articles.id, allow),
    );
    return this.db
      .select()
      .from(articles)
      .where(and(...parts))
      .orderBy(desc(articles.publishedAt))
      .limit(PER_KIND_LIMIT);
  }

  /** Published LMS courses — surfaced as `learning_path` (#1667). */
  async searchLearningPaths(search: string, allow: EntityAllowlist): Promise<CourseRow[]> {
    const parts = whereParts(
      [eq(courses.status, "published")],
      search ? matchEither(search, courses.title, courses.summary) : undefined,
      allowClause(courses.id, allow),
    );
    return this.db
      .select()
      .from(courses)
      .where(and(...parts))
      .orderBy(desc(courses.publishedAt))
      .limit(PER_KIND_LIMIT);
  }

  /** Public, non-cancelled discovery events (`type IN ('event','coffee')`),
   *  soonest first. */
  async searchEvents(search: string, allow: EntityAllowlist): Promise<ScheduledEventRow[]> {
    const parts = whereParts(
      [
        eq(scheduledEvents.visibility, "public"),
        inArray(scheduledEvents.type, ["event", "coffee"]),
        sql`${scheduledEvents.cancelledAt} IS NULL`,
      ],
      search ? matchEither(search, scheduledEvents.title, scheduledEvents.description) : undefined,
      allowClause(scheduledEvents.id, allow),
    );
    return this.db
      .select()
      .from(scheduledEvents)
      .where(and(...parts))
      .orderBy(scheduledEvents.startAt)
      .limit(PER_KIND_LIMIT);
  }
}
