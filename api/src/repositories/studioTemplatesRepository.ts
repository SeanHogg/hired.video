/**
 * StudioTemplatesRepository — the ONLY place Drizzle talks to the studio
 * template marketplace tables (`studio_templates`, `template_licenses`).
 *
 * Layering rule (CLAUDE.md / README §13): Routes → Services → Repository.
 * Nothing outside this file should import `schema.studioTemplates` or
 * `schema.templateLicenses` for reads/writes. The repo has zero business
 * logic — it is a typed Drizzle wrapper and nothing more.
 *
 * Why these two tables share a repo: a creator's publish/unpublish flow
 * always touches both (an "owner" license is granted on publish, revoked
 * on unpublish). Splitting them would force the service to juggle two
 * handles for one transactional unit.
 */

import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const { studioTemplates, templateLicenses } = schema;

export type DbLike = any;

// ─── Row types ──────────────────────────────────────────────────────────────

export type StudioTemplateRow = typeof studioTemplates.$inferSelect;
export type StudioTemplateInsert = typeof studioTemplates.$inferInsert;
export type TemplateLicenseRow = typeof templateLicenses.$inferSelect;
export type TemplateLicenseInsert = typeof templateLicenses.$inferInsert;

/** Columns services may patch on an existing studio template row.
 *  Intentionally a subset of `$inferInsert` — `id`, `creatorId`, `createdAt`
 *  are immutable. `updatedAt` is always set by the repo on update. */
export interface StudioTemplatePatch {
  name?: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  previewVideoUrl?: string | null;
  videoScript?: unknown;
  durationSec?: number | null;
  motion?: string | null;
  language?: string | null;
  tags?: string[];
  visibility?: "private" | "unlisted" | "public";
  listingSlug?: string | null;
  priceCents?: number;
  currency?: string;
  platformFeeBps?: number;
  consentAgreedAt?: Date | null;
  consentIp?: string | null;
  consentUa?: string | null;
  publishedAt?: Date | null;
}

export type TemplateKind = "resume" | "job" | "studio";

/** One row per template owned by a creator, with revenue rolled up across
 *  every `source='purchase'` license. Free claims + the auto-granted owner
 *  license are excluded — only paid sales count toward earnings. */
export interface CreatorTemplateEarningsRow {
  templateId: string;
  name: string;
  listingSlug: string | null;
  visibility: "private" | "unlisted" | "public";
  priceCents: number;
  currency: string;
  thumbnailUrl: string | null;
  /** Cached on the row by `incrementPurchaseCount()` — includes free claims. */
  purchaseCount: number;
  /** SUM of `template_licenses.creator_cut_cents` filtered to paid sales. */
  earningsCents: number;
  /** COUNT of `template_licenses` rows with `source='purchase'`. May be
   *  smaller than `purchaseCount` if free claims contributed to the cached
   *  counter — UI should prefer this number when labelling "paid sales". */
  paidLicenseCount: number;
}

/** Studio template the caller has acquired via a `free` claim or paid
 *  `purchase` license. Owner-licenses (the auto-granted row from publish)
 *  are excluded — those duplicate `findForCreator` and the consumer wants
 *  to render "Created by me" and "Purchased / claimed" as distinct lists.
 *
 *  Both rows are returned so the UI can render the template card AND show
 *  the source (Free / Paid) + grant date without a second round-trip. */
export interface LicensedStudioTemplateRow {
  template: StudioTemplateRow;
  license: TemplateLicenseRow;
}

// ─── Repository interface ───────────────────────────────────────────────────

export interface IStudioTemplatesRepository {
  // studio_templates
  findById(id: string): Promise<StudioTemplateRow | null>;
  findBySlug(slug: string): Promise<StudioTemplateRow | null>;
  findForCreator(creatorId: string): Promise<StudioTemplateRow[]>;
  /** Public-only subset of `findForCreator` — used by the creator's public
   *  profile to surface their templates without leaking private/unlisted
   *  drafts. */
  listPublicForCreator(creatorId: string, opts?: { limit?: number }): Promise<StudioTemplateRow[]>;
  listPublic(opts?: { search?: string; limit?: number }): Promise<StudioTemplateRow[]>;
  /** Templates the user has acquired via `free` claim or paid `purchase`.
   *  Excludes `owner` licenses (those mirror `findForCreator`). */
  findLicensedStudioTemplatesForUser(userId: string): Promise<LicensedStudioTemplateRow[]>;
  /** Per-template revenue rollup for the creator. Left-joins against
   *  `template_licenses` filtered to `source='purchase'` so templates with
   *  zero paid sales still appear (with `earningsCents=0`). */
  earningsForCreator(creatorId: string): Promise<CreatorTemplateEarningsRow[]>;
  insert(input: StudioTemplateInsert): Promise<StudioTemplateRow>;
  update(id: string, creatorId: string, patch: StudioTemplatePatch): Promise<StudioTemplateRow | null>;
  deleteById(id: string, creatorId: string): Promise<boolean>;
  incrementViewCount(id: string): Promise<void>;
  incrementPurchaseCount(id: string): Promise<void>;
  isSlugTaken(slug: string): Promise<boolean>;

  // template_licenses (polymorphic across template kinds)
  findLicense(userId: string, kind: TemplateKind, templateId: string): Promise<TemplateLicenseRow | null>;
  findLicensesForUser(userId: string): Promise<TemplateLicenseRow[]>;
  /** Idempotent — relies on uq_template_licenses_grant. Returns null if a
   *  license already exists, otherwise the inserted row. */
  insertLicense(input: TemplateLicenseInsert): Promise<TemplateLicenseRow | null>;
  deleteLicense(userId: string, kind: TemplateKind, templateId: string): Promise<boolean>;
}

// ─── Implementation ─────────────────────────────────────────────────────────

export class StudioTemplatesRepository implements IStudioTemplatesRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findById(id: string): Promise<StudioTemplateRow | null> {
    const [row] = await this.db.select().from(studioTemplates).where(eq(studioTemplates.id, id)).limit(1);
    return (row as StudioTemplateRow) ?? null;
  }

  async findBySlug(slug: string): Promise<StudioTemplateRow | null> {
    const [row] = await this.db.select().from(studioTemplates).where(eq(studioTemplates.listingSlug, slug)).limit(1);
    return (row as StudioTemplateRow) ?? null;
  }

  async findForCreator(creatorId: string): Promise<StudioTemplateRow[]> {
    return (await this.db
      .select()
      .from(studioTemplates)
      .where(eq(studioTemplates.creatorId, creatorId))
      .orderBy(desc(studioTemplates.updatedAt))) as StudioTemplateRow[];
  }

  async earningsForCreator(creatorId: string): Promise<CreatorTemplateEarningsRow[]> {
    // Left-join: every template owned by the creator appears, with a
    // zero earnings row when no purchases have landed yet. The filter on
    // license source = 'purchase' lives inside the ON clause so it
    // narrows the join rather than the outer WHERE — that's what keeps
    // zero-sale templates in the result set.
    const rows = (await this.db
      .select({
        templateId: studioTemplates.id,
        name: studioTemplates.name,
        listingSlug: studioTemplates.listingSlug,
        visibility: studioTemplates.visibility,
        priceCents: studioTemplates.priceCents,
        currency: studioTemplates.currency,
        thumbnailUrl: studioTemplates.thumbnailUrl,
        purchaseCount: studioTemplates.purchaseCount,
        earningsCents: sql<number>`COALESCE(SUM(${templateLicenses.creatorCutCents}), 0)::int`,
        paidLicenseCount: sql<number>`COUNT(${templateLicenses.id})::int`,
      })
      .from(studioTemplates)
      .leftJoin(
        templateLicenses,
        and(
          // template_licenses.template_id is TEXT (it holds descriptor ids
          // for resume/job kinds too), studio_templates.id is UUID — cast
          // so Postgres has a defined `text = text` operator for the join.
          sql`${templateLicenses.templateId} = ${studioTemplates.id}::text`,
          eq(templateLicenses.templateKind, "studio"),
          eq(templateLicenses.source, "purchase"),
        ),
      )
      .where(eq(studioTemplates.creatorId, creatorId))
      .groupBy(
        studioTemplates.id,
        studioTemplates.name,
        studioTemplates.listingSlug,
        studioTemplates.visibility,
        studioTemplates.priceCents,
        studioTemplates.currency,
        studioTemplates.thumbnailUrl,
        studioTemplates.purchaseCount,
      )
      .orderBy(desc(sql`COALESCE(SUM(${templateLicenses.creatorCutCents}), 0)`))) as CreatorTemplateEarningsRow[];
    return rows;
  }

  async listPublicForCreator(creatorId: string, { limit = 100 }: { limit?: number } = {}): Promise<StudioTemplateRow[]> {
    return (await this.db
      .select()
      .from(studioTemplates)
      .where(and(eq(studioTemplates.creatorId, creatorId), eq(studioTemplates.visibility, "public")))
      .orderBy(desc(studioTemplates.publishedAt))
      .limit(limit)) as StudioTemplateRow[];
  }

  async listPublic({ search, limit = 100 }: { search?: string; limit?: number } = {}): Promise<StudioTemplateRow[]> {
    const visibilityClause = eq(studioTemplates.visibility, "public");
    const where = search
      ? and(
          visibilityClause,
          or(
            ilike(studioTemplates.name, `%${search}%`),
            ilike(studioTemplates.description, `%${search}%`),
          ),
        )
      : visibilityClause;
    return (await this.db
      .select()
      .from(studioTemplates)
      .where(where)
      .orderBy(desc(studioTemplates.publishedAt))
      .limit(limit)) as StudioTemplateRow[];
  }

  async insert(input: StudioTemplateInsert): Promise<StudioTemplateRow> {
    const [row] = await this.db.insert(studioTemplates).values(input as any).returning();
    return row as StudioTemplateRow;
  }

  async update(id: string, creatorId: string, patch: StudioTemplatePatch): Promise<StudioTemplateRow | null> {
    const [row] = await this.db
      .update(studioTemplates)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(and(eq(studioTemplates.id, id), eq(studioTemplates.creatorId, creatorId)))
      .returning();
    return (row as StudioTemplateRow) ?? null;
  }

  async deleteById(id: string, creatorId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: studioTemplates.id })
      .from(studioTemplates)
      .where(and(eq(studioTemplates.id, id), eq(studioTemplates.creatorId, creatorId)))
      .limit(1);
    if (!row) return false;
    await this.db
      .delete(studioTemplates)
      .where(and(eq(studioTemplates.id, id), eq(studioTemplates.creatorId, creatorId)));
    return true;
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.db
      .update(studioTemplates)
      .set({ viewCount: sql`${studioTemplates.viewCount} + 1` } as any)
      .where(eq(studioTemplates.id, id));
  }

  async incrementPurchaseCount(id: string): Promise<void> {
    await this.db
      .update(studioTemplates)
      .set({ purchaseCount: sql`${studioTemplates.purchaseCount} + 1` } as any)
      .where(eq(studioTemplates.id, id));
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: studioTemplates.id })
      .from(studioTemplates)
      .where(eq(studioTemplates.listingSlug, slug))
      .limit(1);
    return Boolean(row);
  }

  // ── template_licenses ─────────────────────────────────────────────────────

  async findLicense(userId: string, kind: TemplateKind, templateId: string): Promise<TemplateLicenseRow | null> {
    const [row] = await this.db
      .select()
      .from(templateLicenses)
      .where(
        and(
          eq(templateLicenses.userId, userId),
          eq(templateLicenses.templateKind, kind),
          eq(templateLicenses.templateId, templateId),
        ),
      )
      .limit(1);
    return (row as TemplateLicenseRow) ?? null;
  }

  async findLicensesForUser(userId: string): Promise<TemplateLicenseRow[]> {
    return (await this.db
      .select()
      .from(templateLicenses)
      .where(eq(templateLicenses.userId, userId))
      .orderBy(desc(templateLicenses.grantedAt))) as TemplateLicenseRow[];
  }

  async findLicensedStudioTemplatesForUser(userId: string): Promise<LicensedStudioTemplateRow[]> {
    // INNER JOIN — only return rows where the studio template still exists.
    // `template_licenses.template_id` is TEXT (it carries descriptor ids for
    // resume/job kinds too); cast on the join so Postgres has a defined
    // `text = text` operator — same trick `earningsForCreator` uses.
    const rows = (await this.db
      .select({ template: studioTemplates, license: templateLicenses })
      .from(templateLicenses)
      .innerJoin(
        studioTemplates,
        sql`${templateLicenses.templateId} = ${studioTemplates.id}::text`,
      )
      .where(
        and(
          eq(templateLicenses.userId, userId),
          eq(templateLicenses.templateKind, "studio"),
          inArray(templateLicenses.source, ["free", "purchase"]),
        ),
      )
      .orderBy(desc(templateLicenses.grantedAt))) as Array<{
      template: StudioTemplateRow;
      license: TemplateLicenseRow;
    }>;
    return rows;
  }

  async insertLicense(input: TemplateLicenseInsert): Promise<TemplateLicenseRow | null> {
    const rows = (await this.db
      .insert(templateLicenses)
      .values(input as any)
      .onConflictDoNothing()
      .returning()) as TemplateLicenseRow[];
    return rows[0] ?? null;
  }

  async deleteLicense(userId: string, kind: TemplateKind, templateId: string): Promise<boolean> {
    const result = await this.db
      .delete(templateLicenses)
      .where(
        and(
          eq(templateLicenses.userId, userId),
          eq(templateLicenses.templateKind, kind),
          eq(templateLicenses.templateId, templateId),
        ),
      )
      .returning({ id: templateLicenses.id });
    return (result as any[]).length > 0;
  }
}
