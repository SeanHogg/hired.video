/**
 * StudioTemplatesService — publish / edit / read for the studio template
 * marketplace. A studio template is a reusable snapshot of ANY studio
 * project kind: a video, a podcast… or a document, whose `document_kind`
 * says whether it is a résumé, job, article or blog template. A résumé
 * template is therefore a studio template with document_kind = 'resume' —
 * one table, one publish path, one set of endpoints (mig 0520 folded the
 * legacy `resume_templates` rows in).
 *
 * Responsibilities (kept out of the route file per the SOLID/DDD layering):
 *   • Publish a creator's studio project — or a résumé's design from the
 *     career kit (templateSource.ts) — as a template (creator-gate, consent
 *     snapshot, slug generation, fee snapshot, owner-license grant).
 *   • Update / unpublish a template.
 *   • Read a creator's own templates and the public marketplace listing
 *     (cached; every write bumps the search-cache version).
 *
 * Licenses (claim / purchase / ownership) live in
 * StudioTemplateLicensesService; what a template stores (the stripped
 * payload + document kind) in studioTemplateSnapshot.ts.
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { slugify } from "../../../../shared/slugify.js";
import { canPublishTemplates, type CreatorProgramFlags } from "../../../../shared/creator-programs.js";
import type {
  IStudioTemplatesRepository,
  StudioTemplateRow,
  StudioTemplatePatch,
  CreatorTemplateEarningsRow,
} from "../../repositories/index.js";
import { buildRepos } from "../../repositories/index.js";
import { bumpSearchVersion, getCachedSearch } from "../../utils/search-cache.js";
import { toJsonSafe, type JsonSafe } from "../../utils/json-safe.js";
import { randomShortId } from "./studioTemplateSnapshot.js";
import { resolveTemplateSource, templateSourceRef, type TemplateSourceRepos } from "./templateSource.js";
import {
  MAX_PRICE_CENTS,
  MIN_PRICE_CENTS,
  PLATFORM_FEE_BPS_DEFAULT,
  StudioTemplatesError,
} from "./studioTemplatesErrors.js";

export {
  MAX_PRICE_CENTS,
  MIN_PRICE_CENTS,
  PLATFORM_FEE_BPS_DEFAULT,
  StudioTemplatesError,
  type StudioTemplatesErrorCode,
} from "./studioTemplatesErrors.js";

const { creatorProfiles } = schema;

export type DbHandle = ReturnType<typeof getDb>;

/** The program flags the publish gate reads off an ACTIVE creator enrollment. */
export type TemplatePublishingFlags = Pick<CreatorProgramFlags, "templatesActive" | "videoActive">;

/** Port: the user's active (endedAt IS NULL) creator enrollment, or null. */
export type ActiveCreatorLookup = (userId: string) => Promise<TemplatePublishingFlags | null>;

export interface StudioTemplatesServiceDeps {
  repos: { studioTemplates: IStudioTemplatesRepository } & TemplateSourceRepos;
  db: DbHandle;
  now: () => Date;
  findActiveCreator: ActiveCreatorLookup;
}

const defaultRepos = (db: DbHandle): StudioTemplatesServiceDeps["repos"] => {
  const { studioTemplates, media, resumes } = buildRepos(db);
  return { studioTemplates, media, resumes };
};

const activeCreatorLookup = (db: DbHandle): ActiveCreatorLookup => async (userId) => {
  const [row] = await db
    .select({
      templatesActive: creatorProfiles.templatesActive,
      videoActive: creatorProfiles.videoActive,
    })
    .from(creatorProfiles)
    .where(and(eq(creatorProfiles.userId, userId), sql`${creatorProfiles.endedAt} IS NULL`))
    .limit(1);
  return row ?? null;
};

const resolveDeps = (deps?: Partial<StudioTemplatesServiceDeps>): StudioTemplatesServiceDeps => {
  const db = deps?.db ?? getDb();
  return {
    db,
    repos: deps?.repos ?? defaultRepos(db),
    now: deps?.now ?? (() => new Date()),
    findActiveCreator: deps?.findActiveCreator ?? activeCreatorLookup(db),
  };
};

// ─── Inputs ─────────────────────────────────────────────────────────────────

export interface PublishTemplateInput {
  creatorUserId: string;
  /** Publish from ONE source the user owns (templateSource.ts): a studio
   *  project to clone, or a résumé whose design becomes a résumé template. */
  sourceProjectId?: string;
  sourceResumeId?: string;
  name: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  previewVideoUrl?: string | null;
  language?: string | null;
  tags?: string[];
  priceCents: number;
  currency?: string;
  visibility?: "private" | "unlisted" | "public";
  /** Required when first publishing as `public`. */
  consentAccepted?: boolean;
  consentIp?: string | null;
  consentUa?: string | null;
  /** Optional inline VideoScript. V2 callers compute this at click time
   *  via `canvasStateToScript(state)` so the V2 project row doesn't have
   *  to mirror a v1 `storyboard` column on every save (#637). When
   *  provided this wins over `project.storyboard`; when absent we read
   *  the legacy column (V1 publish path stays unchanged). */
  videoScript?: unknown;
}

export interface UpdateTemplateInput {
  templateId: string;
  creatorUserId: string;
  patch: {
    name?: string;
    description?: string | null;
    thumbnailUrl?: string | null;
    previewVideoUrl?: string | null;
    language?: string | null;
    tags?: string[];
    priceCents?: number;
    currency?: string;
    visibility?: "private" | "unlisted" | "public";
    consentAccepted?: boolean;
    consentIp?: string | null;
    consentUa?: string | null;
  };
}

// ─── Service ────────────────────────────────────────────────────────────────

export class StudioTemplatesService {
  private readonly deps: StudioTemplatesServiceDeps;

  constructor(deps?: Partial<StudioTemplatesServiceDeps>) {
    this.deps = resolveDeps(deps);
  }

  // ── Creator-program gate ─────────────────────────────────────────────────

  /** Throws unless the user has an active creator enrollment that may list
   *  templates publicly — the Templates program, or (legacy) Video; see
   *  `canPublishTemplates` (#891). Video is still honoured because this gate
   *  used to require it: creators who sell templates today enabled Video,
   *  and accepting either flag keeps them publishing with no data backfill
   *  migration. The public-publish path requires this;
   *  private / unlisted saves and reads do not. */
  async assertCreatorTemplatesActive(userId: string): Promise<void> {
    const creator = await this.deps.findActiveCreator(userId);
    if (!creator) {
      throw new StudioTemplatesError(
        "NOT_A_CREATOR",
        "Publishing studio templates requires a Creator Program enrollment. Enroll at /services?wizard=open before publishing.",
      );
    }
    if (!canPublishTemplates(creator)) {
      throw new StudioTemplatesError(
        "PROGRAM_NOT_ACTIVE",
        "Enable the Templates creator program to publish studio templates.",
      );
    }
  }

  // ── Publishing ───────────────────────────────────────────────────────────

  /** Create a new studio template from a source the user owns — one of
   *  their studio projects, or a résumé's design (a résumé template).
   *  Defaults to `private`; transition to `public` happens inside `update`
   *  so consent + slug + fee snapshot are handled in one place. */
  async publish(input: PublishTemplateInput): Promise<StudioTemplateRow> {
    if (input.priceCents < MIN_PRICE_CENTS || input.priceCents > MAX_PRICE_CENTS) {
      throw new StudioTemplatesError(
        "INVALID_PRICE",
        `Price must be between ${MIN_PRICE_CENTS} and ${MAX_PRICE_CENTS} cents.`,
      );
    }
    if (!input.name?.trim()) {
      throw new StudioTemplatesError("VALIDATION_ERROR", "Template name is required.");
    }

    const visibility = input.visibility ?? "private";
    if (visibility === "public") {
      // Public publish needs creator program + consent. Private/unlisted
      // saves are allowed without the program so the user can stage drafts.
      await this.assertCreatorTemplatesActive(input.creatorUserId);
      if (!input.consentAccepted) {
        throw new StudioTemplatesError(
          "CONSENT_REQUIRED",
          "Accept the studio template marketplace creator terms before publishing publicly.",
        );
      }
    }

    const { repos, now } = this.deps;
    // The source's kind, owning company and stripped payload (incl.
    // document_kind — 'resume' for a résumé design).
    const source = await resolveTemplateSource(
      repos,
      templateSourceRef(input),
      input.creatorUserId,
      input.videoScript,
    );
    const { snapshot } = source;

    const willPublishNow = visibility === "public";
    const slug = willPublishNow ? await this.generateUniqueSlug(input.name) : null;
    const consentAt = willPublishNow && input.consentAccepted ? now() : null;

    // Company-owned sources keep royalties with the company, not the
    // employee who happened to publish (canActFor honours both).
    const inserted = await repos.studioTemplates.insert({
      creatorId: input.creatorUserId,
      companyId: source.companyId,
      sourceProjectId: source.sourceProjectId,
      mediaKind: source.mediaKind,
      documentKind: snapshot.documentKind,
      name: input.name.trim().slice(0, 200),
      description: input.description ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      previewVideoUrl: input.previewVideoUrl ?? null,
      videoScript: snapshot.videoScript,
      durationSec: snapshot.durationSec,
      motion: snapshot.motion,
      language: input.language ?? snapshot.language ?? null,
      tags: input.tags ?? [],
      visibility,
      listingSlug: slug,
      priceCents: input.priceCents,
      currency: input.currency ?? "USD",
      platformFeeBps: PLATFORM_FEE_BPS_DEFAULT,
      consentAgreedAt: consentAt,
      consentIp: willPublishNow ? input.consentIp ?? null : null,
      consentUa: willPublishNow ? input.consentUa ?? null : null,
      publishedAt: willPublishNow ? now() : null,
    });

    // Owner license — auto-granted so the creator can always reload their
    // own template into Studio without going through the cart.
    await repos.studioTemplates.insertLicense({
      userId: input.creatorUserId,
      templateKind: "studio",
      templateId: inserted.id,
      source: "owner",
    });

    bumpSearchVersion();
    return inserted;
  }

  /** Patch an existing template. Handles the private→public transition
   *  (consent + slug + fee snapshot + publishedAt). */
  async update(input: UpdateTemplateInput): Promise<StudioTemplateRow> {
    const { repos, now } = this.deps;
    const existing = await repos.studioTemplates.findById(input.templateId);
    if (!existing) throw new StudioTemplatesError("NOT_FOUND", "Template not found.");
    if (existing.creatorId !== input.creatorUserId) {
      throw new StudioTemplatesError("FORBIDDEN", "You can only edit your own templates.");
    }

    if (input.patch.priceCents !== undefined) {
      if (input.patch.priceCents < MIN_PRICE_CENTS || input.patch.priceCents > MAX_PRICE_CENTS) {
        throw new StudioTemplatesError("INVALID_PRICE", `Price out of allowed range.`);
      }
    }

    // Only the fields the caller sent (undefined = leave as is).
    const p = input.patch;
    const patch: StudioTemplatePatch = {
      ...(p.name !== undefined && { name: p.name }),
      ...(p.description !== undefined && { description: p.description }),
      ...(p.thumbnailUrl !== undefined && { thumbnailUrl: p.thumbnailUrl }),
      ...(p.previewVideoUrl !== undefined && { previewVideoUrl: p.previewVideoUrl }),
      ...(p.language !== undefined && { language: p.language }),
      ...(p.tags !== undefined && { tags: p.tags }),
      ...(p.priceCents !== undefined && { priceCents: p.priceCents }),
      ...(p.currency !== undefined && { currency: p.currency }),
    };

    const visibilityChanged =
      input.patch.visibility !== undefined && input.patch.visibility !== existing.visibility;
    if (visibilityChanged) {
      const next = input.patch.visibility!;
      if (next === "public") {
        await this.assertCreatorTemplatesActive(input.creatorUserId);
        if (!input.patch.consentAccepted && !existing.consentAgreedAt) {
          throw new StudioTemplatesError(
            "CONSENT_REQUIRED",
            "Accept the studio template marketplace creator terms before publishing publicly.",
          );
        }
        if (input.patch.consentAccepted && !existing.consentAgreedAt) {
          patch.consentAgreedAt = now();
          patch.consentIp = input.patch.consentIp ?? null;
          patch.consentUa = input.patch.consentUa ?? null;
        }
        if (!existing.listingSlug) {
          patch.listingSlug = await this.generateUniqueSlug(input.patch.name ?? existing.name);
        }
        if (!existing.publishedAt) patch.publishedAt = now();
      }
      patch.visibility = next;
    }

    const updated = await repos.studioTemplates.update(input.templateId, input.creatorUserId, patch);
    if (!updated) throw new StudioTemplatesError("NOT_FOUND", "Template not found.");
    bumpSearchVersion();
    return updated;
  }

  async deleteById(templateId: string, creatorUserId: string): Promise<void> {
    const { repos } = this.deps;
    const ok = await repos.studioTemplates.deleteById(templateId, creatorUserId);
    if (!ok) throw new StudioTemplatesError("NOT_FOUND", "Template not found.");
    bumpSearchVersion();
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  async getById(templateId: string): Promise<StudioTemplateRow | null> {
    return this.deps.repos.studioTemplates.findById(templateId);
  }

  async getBySlug(slug: string): Promise<StudioTemplateRow | null> {
    return this.deps.repos.studioTemplates.findBySlug(slug);
  }

  async listForCreator(creatorUserId: string): Promise<StudioTemplateRow[]> {
    return this.deps.repos.studioTemplates.findForCreator(creatorUserId);
  }

  async listPublic(opts?: { search?: string; limit?: number }): Promise<StudioTemplateRow[]> {
    return this.deps.repos.studioTemplates.listPublic(opts);
  }

  async listPublicForCreator(creatorUserId: string, opts?: { limit?: number }): Promise<StudioTemplateRow[]> {
    return this.deps.repos.studioTemplates.listPublicForCreator(creatorUserId, opts);
  }

  // ── Cached public reads ──────────────────────────────────────────────────
  // Anonymous + shared marketplace reads go through the versioned search
  // cache: publish / update / delete above call bumpSearchVersion(), which
  // orphans every entry. view/purchase counters may lag by the 120s TTL.
  // Rows are projected JSON-safe so KV hits and misses share one shape.

  listPublicCached(opts: { search?: string; limit?: number }): Promise<JsonSafe<StudioTemplateRow>[]> {
    const key = `studio-templates:public:${JSON.stringify([opts.search ?? "", opts.limit ?? ""])}`;
    return getCachedSearch(key, async () => toJsonSafe(await this.listPublic(opts)));
  }

  listPublicForCreatorCached(
    creatorUserId: string,
    opts: { limit?: number },
  ): Promise<JsonSafe<StudioTemplateRow>[]> {
    const key = `studio-templates:by-user:${creatorUserId}:${opts.limit ?? ""}`;
    return getCachedSearch(key, async () => toJsonSafe(await this.listPublicForCreator(creatorUserId, opts)));
  }

  /** Public listing by slug — null unless the template is public. */
  getPublicBySlugCached(slug: string): Promise<JsonSafe<StudioTemplateRow> | null> {
    return getCachedSearch(`studio-templates:slug:${slug}`, async () => {
      const row = await this.getBySlug(slug);
      return row && row.visibility === "public" ? toJsonSafe(row) : null;
    });
  }

  /** Per-template earnings rollup for the creator's marketplace dashboard
   *  (#631). Returns one row per owned template (including zero-sale rows)
   *  plus aggregate totals so the consumer doesn't recompute them. */
  async earningsForCreator(creatorUserId: string): Promise<{
    rows: CreatorTemplateEarningsRow[];
    totalEarningsCents: number;
    totalPaidLicenses: number;
    currency: string;
  }> {
    const rows = await this.deps.repos.studioTemplates.earningsForCreator(creatorUserId);
    const totalEarningsCents = rows.reduce((sum, r) => sum + (r.earningsCents ?? 0), 0);
    const totalPaidLicenses = rows.reduce((sum, r) => sum + (r.paidLicenseCount ?? 0), 0);
    // All rows share a currency in practice (USD today, schema default).
    // Pick the first row's value when present so the UI can still render
    // a sensible label if a future column-level currency split lands.
    const currency = rows[0]?.currency ?? "USD";
    return { rows, totalEarningsCents, totalPaidLicenses, currency };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name, { fallback: "template" });
    // 90% of the time the base + 6-char id suffix is fine. We loop with a
    // fresh suffix on the rare collision so we never insert with a stale slug.
    for (let i = 0; i < 5; i++) {
      const suffix = randomShortId();
      const candidate = `${base}-${suffix}`;
       
      if (!(await this.deps.repos.studioTemplates.isSlugTaken(candidate))) return candidate;
    }
    // Fallback: append a longer suffix so collision odds are negligible.
    return `${base}-${randomShortId()}${randomShortId()}`;
  }
}
