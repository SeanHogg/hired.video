/**
 * StudioTemplatesService — domain logic for the studio template marketplace.
 *
 * Responsibilities (kept out of the route file per the SOLID/DDD layering):
 *   • Publish a creator's studio project as a template (creator-gate, consent
 *     snapshot, slug generation, fee snapshot, owner-license grant).
 *   • Update / unpublish a template.
 *   • Read a creator's own templates and the public marketplace listing.
 *   • Grant / check / list template licenses (polymorphic across kinds).
 *   • Strip user-specific fields from a VideoScript before storing it as a
 *     reusable template (no `resumeText` leakage, no original creator's
 *     name baked into scene overlays).
 *
 * Routes call into this service; the service depends on the repo interface
 * for studio_templates + template_licenses access and on the raw DB handle
 * for creator-program reads (no CreatorRepository exists yet).
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { slugify } from "../../../../shared/slugify.js";
import type {
  IStudioTemplatesRepository,
  StudioTemplateRow,
  TemplateLicenseRow,
  TemplateKind,
  CreatorTemplateEarningsRow,
  LicensedStudioTemplateRow,
} from "../../repositories/index.js";
import { buildRepos } from "../../repositories/index.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";

/** Snapshotted from the existing PLATFORM_FEE_BPS_DEFAULT in
 *  routes/studio-features.ts — duplicated as a constant here so this
 *  service has no inbound dependency on a route module. Keep in sync. */
export const PLATFORM_FEE_BPS_DEFAULT = 500; // 5%
export const MAX_PRICE_CENTS = 1_000_00;     // $1,000 hard cap
export const MIN_PRICE_CENTS = 0;

const { creatorProfiles, studioProjects } = schema;

export type DbHandle = ReturnType<typeof getDb>;

export interface StudioTemplatesServiceDeps {
  repos: { studioTemplates: IStudioTemplatesRepository };
  db: DbHandle;
  now: () => Date;
}

const resolveDeps = (deps?: Partial<StudioTemplatesServiceDeps>): StudioTemplatesServiceDeps => {
  if (deps?.repos && deps.db && deps.now) return deps as StudioTemplatesServiceDeps;
  const db = deps?.db ?? getDb();
  return {
    db,
    repos: deps?.repos ?? { studioTemplates: buildRepos(db).studioTemplates },
    now: deps?.now ?? (() => new Date()),
  };
};

// ─── Errors — typed sentinels routes can map to HTTP status ─────────────────

export class StudioTemplatesError extends Error {
  constructor(public readonly code: StudioTemplatesErrorCode, message: string) {
    super(message);
    this.name = "StudioTemplatesError";
  }
}

export type StudioTemplatesErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "CONSENT_REQUIRED"
  | "NOT_A_CREATOR"
  | "PROGRAM_NOT_ACTIVE"
  | "INVALID_PRICE";

// ─── Inputs ─────────────────────────────────────────────────────────────────

export interface PublishTemplateInput {
  creatorUserId: string;
  /** Source project id to clone from. The project must belong to the user. */
  sourceProjectId: string;
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

  /** Returns true iff the user has an active creator enrollment with the
   *  video program turned on. The publish path requires this; reads do not. */
  async assertCreatorVideoActive(userId: string): Promise<void> {
    const { db } = this.deps;
    const [row] = await db
      .select({
        videoActive: creatorProfiles.videoActive,
        endedAt: creatorProfiles.endedAt,
      })
      .from(creatorProfiles)
      .where(and(eq(creatorProfiles.userId, userId), sql`${creatorProfiles.endedAt} IS NULL`))
      .limit(1);
    if (!row) {
      throw new StudioTemplatesError(
        "NOT_A_CREATOR",
        "Publishing studio templates requires a Creator Program enrollment. Enroll at /services?wizard=open before publishing.",
      );
    }
    if (!row.videoActive) {
      throw new StudioTemplatesError(
        "PROGRAM_NOT_ACTIVE",
        "Enable the Video creator program to publish studio templates.",
      );
    }
  }

  // ── Publishing ───────────────────────────────────────────────────────────

  /** Create a new studio template from one of the user's projects.
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
      await this.assertCreatorVideoActive(input.creatorUserId);
      if (!input.consentAccepted) {
        throw new StudioTemplatesError(
          "CONSENT_REQUIRED",
          "Accept the studio template marketplace creator terms before publishing publicly.",
        );
      }
    }

    const { db, repos, now } = this.deps;
    const [project] = await db
      .select()
      .from(studioProjects)
      .where(and(eq(studioProjects.id, input.sourceProjectId), eq(studioProjects.userId, input.creatorUserId)))
      .limit(1);
    if (!project) {
      throw new StudioTemplatesError("NOT_FOUND", "Source studio project not found.");
    }
    // Prefer the inline `videoScript` from V2 callers — they compute it
    // at click time via `canvasStateToScript(state)` so the project row
    // doesn't need to mirror a v1 storyboard column (gap #637). Falls
    // back to `project.storyboard` for legacy V1 projects whose script
    // already lives on the row.
    const scriptSource = input.videoScript ?? project.storyboard;
    if (!scriptSource) {
      throw new StudioTemplatesError(
        "VALIDATION_ERROR",
        "Source project has no script yet — save the project before publishing as a template.",
      );
    }

    const sanitisedScript = sanitiseScriptForTemplate(scriptSource);
    const meta = extractScriptMeta(sanitisedScript);

    const willPublishNow = visibility === "public";
    const slug = willPublishNow ? await this.generateUniqueSlug(input.name) : null;
    const consentAt = willPublishNow && input.consentAccepted ? now() : null;

    // Inherit company-ownership from the source project so royalties on
    // company-owned templates accrue to the company, not the individual
    // employee who happened to publish. The owner license below also
    // gets granted to the company-via-membership rather than only the
    // creator user (the canActFor check honours both).
    const ownerCompanyId = (project as any).companyId ?? null;

    // Snapshot the source project's mediaKind so the template is the
    // same kind as what the creator authored. Per the standing DRY rule
    // there is no separate "what kind is this template?" form field;
    // the publish dialog reads project.mediaKind read-only. Defaults to
    // 'video' if the column is null (legacy pre-#894 rows).
    const sourceMediaKind = (project as any).mediaKind ?? "video";

    const inserted = await repos.studioTemplates.insert({
      creatorId: input.creatorUserId,
      companyId: ownerCompanyId,
      sourceProjectId: input.sourceProjectId,
      mediaKind: sourceMediaKind,
      name: input.name.trim().slice(0, 200),
      description: input.description ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      previewVideoUrl: input.previewVideoUrl ?? null,
      videoScript: sanitisedScript,
      durationSec: meta.durationSec,
      motion: meta.motion,
      language: input.language ?? meta.language ?? null,
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
    } as any);

    // Owner license — auto-granted so the creator can always reload their
    // own template into Studio without going through the cart.
    await repos.studioTemplates.insertLicense({
      userId: input.creatorUserId,
      templateKind: "studio",
      templateId: inserted.id,
      source: "owner",
    } as any);

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

    const patch: Record<string, unknown> = {};
    for (const k of [
      "name",
      "description",
      "thumbnailUrl",
      "previewVideoUrl",
      "language",
      "tags",
      "priceCents",
      "currency",
    ] as const) {
      if (input.patch[k] !== undefined) patch[k] = input.patch[k];
    }

    const visibilityChanged =
      input.patch.visibility !== undefined && input.patch.visibility !== existing.visibility;
    if (visibilityChanged) {
      const next = input.patch.visibility!;
      if (next === "public") {
        await this.assertCreatorVideoActive(input.creatorUserId);
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

    const updated = await repos.studioTemplates.update(input.templateId, input.creatorUserId, patch as any);
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

  // ── Licenses ─────────────────────────────────────────────────────────────

  /** Grants a free license — the public listing must currently be free
   *  (priceCents === 0) and not already owned. Idempotent. */
  async claimFree(userId: string, templateId: string): Promise<TemplateLicenseRow> {
    const { repos } = this.deps;
    const t = await repos.studioTemplates.findById(templateId);
    if (!t) throw new StudioTemplatesError("NOT_FOUND", "Template not found.");
    if (t.visibility !== "public") {
      throw new StudioTemplatesError("FORBIDDEN", "Template is not publicly listed.");
    }
    if (t.priceCents > 0) {
      throw new StudioTemplatesError("VALIDATION_ERROR", "This template requires purchase.");
    }
    const existing = await repos.studioTemplates.findLicense(userId, "studio", templateId);
    if (existing) return existing;
    const created = await repos.studioTemplates.insertLicense({
      userId,
      templateKind: "studio",
      templateId,
      source: "free",
    } as any);
    return created!;
  }

  /** Records a paid license. Snapshots the fee split at the time of the
   *  call from the listing's stored `platformFeeBps`. Idempotent — duplicate
   *  fulfilment calls return the existing row. */
  async grantPurchase(input: {
    userId: string;
    kind: TemplateKind;
    templateId: string;
    pricePaidCents: number;
    paymentRef?: string | null;
  }): Promise<TemplateLicenseRow> {
    const { repos } = this.deps;
    const existing = await repos.studioTemplates.findLicense(input.userId, input.kind, input.templateId);
    if (existing) return existing;

    let feeBps = PLATFORM_FEE_BPS_DEFAULT;
    if (input.kind === "studio") {
      const t = await repos.studioTemplates.findById(input.templateId);
      if (!t) throw new StudioTemplatesError("NOT_FOUND", "Template not found.");
      feeBps = t.platformFeeBps;
    }

    const platformCutCents = Math.round((input.pricePaidCents * feeBps) / 10000);
    const creatorCutCents = input.pricePaidCents - platformCutCents;

    const row = await repos.studioTemplates.insertLicense({
      userId: input.userId,
      templateKind: input.kind,
      templateId: input.templateId,
      source: "purchase",
      pricePaidCents: input.pricePaidCents,
      creatorCutCents,
      platformCutCents,
      paymentRef: input.paymentRef ?? null,
    } as any);

    if (input.kind === "studio" && row) {
      await repos.studioTemplates.incrementPurchaseCount(input.templateId);
    }
    // If onConflictDoNothing returned null, the user already had a license
    // — return the pre-existing row so the caller still gets a 200 shape.
    return row ?? (await repos.studioTemplates.findLicense(input.userId, input.kind, input.templateId))!;
  }

  async listLicensesForUser(userId: string): Promise<TemplateLicenseRow[]> {
    return this.deps.repos.studioTemplates.findLicensesForUser(userId);
  }

  /** Studio templates the user has acquired via `free` claim or paid
   *  `purchase` — used by the /studio landing "Your templates" section to
   *  show "claimed / bought" cards alongside the user's own published
   *  templates. Owner licenses are excluded (those mirror
   *  `listForCreator`); the consumer composes the two lists with the
   *  source-of-record distinction preserved. */
  async listLicensedStudioTemplatesForUser(userId: string): Promise<LicensedStudioTemplateRow[]> {
    return this.deps.repos.studioTemplates.findLicensedStudioTemplatesForUser(userId);
  }

  async hasLicense(userId: string, kind: TemplateKind, templateId: string): Promise<boolean> {
    const row = await this.deps.repos.studioTemplates.findLicense(userId, kind, templateId);
    return Boolean(row);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name, { fallback: "template" });
    // 90% of the time the base + 6-char id suffix is fine. We loop with a
    // fresh suffix on the rare collision so we never insert with a stale slug.
    for (let i = 0; i < 5; i++) {
      const suffix = randomShortId();
      const candidate = `${base}-${suffix}`;
      // eslint-disable-next-line no-await-in-loop
      if (!(await this.deps.repos.studioTemplates.isSlugTaken(candidate))) return candidate;
    }
    // Fallback: append a longer suffix so collision odds are negligible.
    return `${base}-${randomShortId()}${randomShortId()}`;
  }
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

/** Strip user-specific fields from a VideoScript so the same JSON can be
 *  reused as a template. Keeps theme + scene structure + animations intact;
 *  drops resumeText-derived strings, narrator-name overlays, and any
 *  `meta.ownerName` style fields if present. */
export function sanitiseScriptForTemplate(script: unknown): Record<string, unknown> {
  if (!script || typeof script !== "object") return {};
  const cloned = JSON.parse(JSON.stringify(script)) as Record<string, unknown>;
  // Drop top-level user-identifying fields.
  delete (cloned as any).resumeText;
  delete (cloned as any).resumeId;
  delete (cloned as any).ownerName;
  delete (cloned as any).ownerEmail;
  // Scenes may carry hardcoded names in element.text — replace with placeholder
  // tokens so the template loader can substitute the new user's data.
  const scenes = (cloned as any).scenes;
  if (Array.isArray(scenes)) {
    for (const scene of scenes) {
      if (scene && Array.isArray(scene.elements)) {
        for (const el of scene.elements) {
          // Common pattern: scene 1 / scene 4 carry the candidate's name.
          // Replace with a token the template loader knows how to substitute.
          if (el && typeof el === "object" && "role" in el && el.role === "name" && typeof el.text === "string") {
            el.text = "{{name}}";
          }
          if (el && typeof el === "object" && "role" in el && el.role === "headline" && typeof el.text === "string") {
            el.text = "{{headline}}";
          }
        }
      }
    }
  }
  return cloned;
}

/** Pull catalog-card metadata out of the script JSON so we can show
 *  duration/motion/language on the marketplace card without parsing the
 *  whole script on every render. */
function extractScriptMeta(script: unknown): {
  durationSec: number | null;
  motion: string | null;
  language: string | null;
} {
  if (!script || typeof script !== "object") return { durationSec: null, motion: null, language: null };
  const s = script as any;
  const durationSec = typeof s?.video?.duration === "number" ? Math.round(s.video.duration) : null;
  const motion = typeof s?.video?.theme?.motion === "string" ? s.video.theme.motion : null;
  const language = typeof s?.video?.audio?.language === "string" ? s.video.audio.language : null;
  return { durationSec, motion, language };
}

function randomShortId(): string {
  // `crypto` is a Workers global (see api/tsconfig.json types entry); the
  // Math.random() fallback only fires in test environments that stub it.
  const bytes = new Uint8Array(4);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
