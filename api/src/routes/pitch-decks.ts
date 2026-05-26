// pitch-decks.ts — Recruiter-authored collections of redacted/branded
// candidates (week-1 MVP of gap #99). Sibling to routes/candidates.ts —
// shares the company-scope helper and redaction service.
//
// Surfaces:
//   • /api/recruit/pitch-decks         — deck CRUD
//   • /api/recruit/pitch-decks/:id/slides — deck-slide management
//   • /api/recruit/pitch-decks/:id/shares — tokenized share creation
//   • /api/recruit/pitch-deck-shares/:id  — share mutation
//   • /api/public/pitch-deck/:token    — unauthenticated reviewer view

import { Hono } from "hono";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import {
  resolveCompanyScope,
  userCanAccessCompany,
} from "../services/company/scope.js";
import {
  applyRedaction,
  DEFAULT_REDACTION_RULES,
  type RedactionRules,
} from "../services/resume/redaction.js";

export const pitchDeckRoutes = new Hono<AppEnv>();
export const pitchDeckPublicRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function generateShareToken(): string {
  return randomBytes(16).toString("hex");
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CreateDeckSchema = z.object({
  companyId: UuidLikeSchema,
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  jobId: UuidLikeSchema.optional(),
  whitelabelTenantId: UuidLikeSchema.optional(),
  redactionProfileId: UuidLikeSchema.optional(),
  status: z.enum(["draft", "sent", "archived"]).optional(),
});

const UpdateDeckSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  jobId: UuidLikeSchema.nullable().optional(),
  whitelabelTenantId: UuidLikeSchema.nullable().optional(),
  redactionProfileId: UuidLikeSchema.nullable().optional(),
  status: z.enum(["draft", "sent", "archived"]).optional(),
});

const AddSlideSchema = z.object({
  candidateResumeId: UuidLikeSchema,
  displayOrder: z.number().int().min(0).optional(),
  redactionProfileId: UuidLikeSchema.optional(),
  fitSummary: z.string().optional(),
  matchScore: z.number().int().min(0).max(100).optional(),
  recruiterNotes: z.string().optional(),
});

const UpdateSlideSchema = z.object({
  displayOrder: z.number().int().min(0).optional(),
  redactionProfileId: UuidLikeSchema.nullable().optional(),
  fitSummary: z.string().nullable().optional(),
  matchScore: z.number().int().min(0).max(100).nullable().optional(),
  recruiterNotes: z.string().nullable().optional(),
});

const CreateDeckShareSchema = z.object({
  recipientName: z.string().max(255).optional(),
  recipientEmail: z.string().email().optional(),
  expiresAt: z.string().datetime().optional(),
});

const UpdateDeckShareSchema = z.object({
  recipientName: z.string().max(255).optional(),
  recipientEmail: z.string().email().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

// ─── pitch_decks CRUD ────────────────────────────────────────────────────────

pitchDeckRoutes.get("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const scope = await resolveCompanyScope(userId, c.req.query("companyId"));
  if (scope.companyIds.length === 0) return c.json(success([]), 200);

  const filter = c.req.query("companyId");
  if (filter && !scope.companyIds.includes(filter)) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.pitchDecks)
    .where(
      filter
        ? eq(schema.pitchDecks.companyId, filter)
        : inArray(schema.pitchDecks.companyId, scope.companyIds),
    )
    .orderBy(desc(schema.pitchDecks.updatedAt));
  return c.json(success(rows), 200);
});

pitchDeckRoutes.get("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [deck] = await db
    .select()
    .from(schema.pitchDecks)
    .where(eq(schema.pitchDecks.id, c.req.param("id")))
    .limit(1);
  if (!deck) return c.json(error("NOT_FOUND", "Pitch deck not found"), 404);
  if (!(await userCanAccessCompany(userId, deck.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  const slides = await db
    .select()
    .from(schema.pitchDeckCandidates)
    .where(eq(schema.pitchDeckCandidates.deckId, deck.id))
    .orderBy(asc(schema.pitchDeckCandidates.displayOrder));

  return c.json(success({ ...deck, slides }), 200);
});

pitchDeckRoutes.post("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateDeckSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid payload", parsed.error.flatten()), 400);
  }
  if (!(await userCanAccessCompany(userId, parsed.data.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  const db = getDb();
  const [row] = await db
    .insert(schema.pitchDecks)
    .values({
      companyId: parsed.data.companyId,
      createdByUserId: userId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      jobId: parsed.data.jobId ?? null,
      whitelabelTenantId: parsed.data.whitelabelTenantId ?? null,
      redactionProfileId: parsed.data.redactionProfileId ?? null,
      status: parsed.data.status ?? "draft",
    } as any)
    .returning();
  return c.json(success(row), 201);
});

pitchDeckRoutes.patch("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateDeckSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid payload", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [existing] = await db
    .select({ companyId: schema.pitchDecks.companyId })
    .from(schema.pitchDecks)
    .where(eq(schema.pitchDecks.id, c.req.param("id")))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Pitch deck not found"), 404);
  if (!(await userCanAccessCompany(userId, existing.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  const [row] = await db
    .update(schema.pitchDecks)
    .set({
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.jobId !== undefined && { jobId: parsed.data.jobId }),
      ...(parsed.data.whitelabelTenantId !== undefined && {
        whitelabelTenantId: parsed.data.whitelabelTenantId,
      }),
      ...(parsed.data.redactionProfileId !== undefined && {
        redactionProfileId: parsed.data.redactionProfileId,
      }),
      ...(parsed.data.status !== undefined && { status: parsed.data.status }),
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.pitchDecks.id, c.req.param("id")))
    .returning();
  return c.json(success(row), 200);
});

pitchDeckRoutes.delete("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [existing] = await db
    .select({ companyId: schema.pitchDecks.companyId })
    .from(schema.pitchDecks)
    .where(eq(schema.pitchDecks.id, c.req.param("id")))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Pitch deck not found"), 404);
  if (!(await userCanAccessCompany(userId, existing.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }
  await db.delete(schema.pitchDecks).where(eq(schema.pitchDecks.id, c.req.param("id")));
  return c.json(success({ deleted: true }), 200);
});

// ─── pitch_deck_candidates (slides) ──────────────────────────────────────────

pitchDeckRoutes.post("/:id/slides", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = AddSlideSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid payload", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [deck] = await db
    .select({ companyId: schema.pitchDecks.companyId })
    .from(schema.pitchDecks)
    .where(eq(schema.pitchDecks.id, c.req.param("id")))
    .limit(1);
  if (!deck) return c.json(error("NOT_FOUND", "Pitch deck not found"), 404);
  if (!(await userCanAccessCompany(userId, deck.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  // Verify the candidate resume belongs to the same company (prevents
  // cross-tenant leaks via a mismatched slide).
  const [cr] = await db
    .select({ companyId: schema.candidateResumes.companyId })
    .from(schema.candidateResumes)
    .where(eq(schema.candidateResumes.id, parsed.data.candidateResumeId))
    .limit(1);
  if (!cr || cr.companyId !== deck.companyId) {
    return c.json(error("VALIDATION_ERROR", "candidateResumeId must belong to the deck's company"), 400);
  }

  const [row] = await db
    .insert(schema.pitchDeckCandidates)
    .values({
      deckId: c.req.param("id"),
      candidateResumeId: parsed.data.candidateResumeId,
      displayOrder: parsed.data.displayOrder ?? 0,
      redactionProfileId: parsed.data.redactionProfileId ?? null,
      fitSummary: parsed.data.fitSummary ?? null,
      matchScore: parsed.data.matchScore ?? null,
      recruiterNotes: parsed.data.recruiterNotes ?? null,
    } as any)
    .returning();
  return c.json(success(row), 201);
});

pitchDeckRoutes.patch("/:id/slides/:slideId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateSlideSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid payload", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [slide] = await db
    .select({
      id: schema.pitchDeckCandidates.id,
      deckId: schema.pitchDeckCandidates.deckId,
    })
    .from(schema.pitchDeckCandidates)
    .where(
      and(
        eq(schema.pitchDeckCandidates.id, c.req.param("slideId")),
        eq(schema.pitchDeckCandidates.deckId, c.req.param("id")),
      ),
    )
    .limit(1);
  if (!slide) return c.json(error("NOT_FOUND", "Slide not found"), 404);

  const [deck] = await db
    .select({ companyId: schema.pitchDecks.companyId })
    .from(schema.pitchDecks)
    .where(eq(schema.pitchDecks.id, slide.deckId))
    .limit(1);
  if (!deck || !(await userCanAccessCompany(userId, deck.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  const [row] = await db
    .update(schema.pitchDeckCandidates)
    .set({
      ...(parsed.data.displayOrder !== undefined && { displayOrder: parsed.data.displayOrder }),
      ...(parsed.data.redactionProfileId !== undefined && {
        redactionProfileId: parsed.data.redactionProfileId,
      }),
      ...(parsed.data.fitSummary !== undefined && { fitSummary: parsed.data.fitSummary }),
      ...(parsed.data.matchScore !== undefined && { matchScore: parsed.data.matchScore }),
      ...(parsed.data.recruiterNotes !== undefined && { recruiterNotes: parsed.data.recruiterNotes }),
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.pitchDeckCandidates.id, c.req.param("slideId")))
    .returning();
  return c.json(success(row), 200);
});

pitchDeckRoutes.delete("/:id/slides/:slideId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [slide] = await db
    .select({ deckId: schema.pitchDeckCandidates.deckId })
    .from(schema.pitchDeckCandidates)
    .where(
      and(
        eq(schema.pitchDeckCandidates.id, c.req.param("slideId")),
        eq(schema.pitchDeckCandidates.deckId, c.req.param("id")),
      ),
    )
    .limit(1);
  if (!slide) return c.json(error("NOT_FOUND", "Slide not found"), 404);

  const [deck] = await db
    .select({ companyId: schema.pitchDecks.companyId })
    .from(schema.pitchDecks)
    .where(eq(schema.pitchDecks.id, slide.deckId))
    .limit(1);
  if (!deck || !(await userCanAccessCompany(userId, deck.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  await db
    .delete(schema.pitchDeckCandidates)
    .where(eq(schema.pitchDeckCandidates.id, c.req.param("slideId")));
  return c.json(success({ deleted: true }), 200);
});

// ─── pitch_deck_shares ───────────────────────────────────────────────────────

pitchDeckRoutes.get("/:id/shares", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [deck] = await db
    .select({ companyId: schema.pitchDecks.companyId })
    .from(schema.pitchDecks)
    .where(eq(schema.pitchDecks.id, c.req.param("id")))
    .limit(1);
  if (!deck) return c.json(error("NOT_FOUND", "Pitch deck not found"), 404);
  if (!(await userCanAccessCompany(userId, deck.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  const rows = await db
    .select()
    .from(schema.pitchDeckShares)
    .where(eq(schema.pitchDeckShares.deckId, c.req.param("id")))
    .orderBy(desc(schema.pitchDeckShares.createdAt));
  return c.json(success(rows), 200);
});

pitchDeckRoutes.post("/:id/shares", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateDeckShareSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid payload", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [deck] = await db
    .select({ companyId: schema.pitchDecks.companyId })
    .from(schema.pitchDecks)
    .where(eq(schema.pitchDecks.id, c.req.param("id")))
    .limit(1);
  if (!deck) return c.json(error("NOT_FOUND", "Pitch deck not found"), 404);
  if (!(await userCanAccessCompany(userId, deck.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  const [row] = await db
    .insert(schema.pitchDeckShares)
    .values({
      deckId: c.req.param("id"),
      sharedByUserId: userId,
      shareToken: generateShareToken(),
      recipientName: parsed.data.recipientName ?? null,
      recipientEmail: parsed.data.recipientEmail ?? null,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      isActive: true,
    } as any)
    .returning();
  return c.json(success(row), 201);
});

// Share mutation is mounted at a sibling path (no deck-id in URL) because
// a revoke request only needs the share id.
pitchDeckRoutes.patch("/shares/:shareId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateDeckShareSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid payload", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [share] = await db
    .select({ deckId: schema.pitchDeckShares.deckId })
    .from(schema.pitchDeckShares)
    .where(eq(schema.pitchDeckShares.id, c.req.param("shareId")))
    .limit(1);
  if (!share) return c.json(error("NOT_FOUND", "Share not found"), 404);

  const [deck] = await db
    .select({ companyId: schema.pitchDecks.companyId })
    .from(schema.pitchDecks)
    .where(eq(schema.pitchDecks.id, share.deckId))
    .limit(1);
  if (!deck || !(await userCanAccessCompany(userId, deck.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  const [row] = await db
    .update(schema.pitchDeckShares)
    .set({
      ...(parsed.data.recipientName !== undefined && { recipientName: parsed.data.recipientName }),
      ...(parsed.data.recipientEmail !== undefined && { recipientEmail: parsed.data.recipientEmail }),
      ...(parsed.data.expiresAt !== undefined && {
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      }),
      ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.pitchDeckShares.id, c.req.param("shareId")))
    .returning();
  return c.json(success(row), 200);
});

pitchDeckRoutes.delete("/shares/:shareId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [share] = await db
    .select({ deckId: schema.pitchDeckShares.deckId })
    .from(schema.pitchDeckShares)
    .where(eq(schema.pitchDeckShares.id, c.req.param("shareId")))
    .limit(1);
  if (!share) return c.json(error("NOT_FOUND", "Share not found"), 404);

  const [deck] = await db
    .select({ companyId: schema.pitchDecks.companyId })
    .from(schema.pitchDecks)
    .where(eq(schema.pitchDecks.id, share.deckId))
    .limit(1);
  if (!deck || !(await userCanAccessCompany(userId, deck.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  await db
    .delete(schema.pitchDeckShares)
    .where(eq(schema.pitchDeckShares.id, c.req.param("shareId")));
  return c.json(success({ revoked: true }), 200);
});

// ─── Public pitch-deck view ──────────────────────────────────────────────────

function rulesFromProfile(profile: any | null): RedactionRules {
  if (!profile) return DEFAULT_REDACTION_RULES;
  return {
    hideName: profile.hideName,
    hideEmail: profile.hideEmail,
    hidePhone: profile.hidePhone,
    hideAddress: profile.hideAddress,
    hideLinkedin: profile.hideLinkedin,
    hideOtherUrls: profile.hideOtherUrls,
    hideAvatar: profile.hideAvatar,
    replacementName: profile.replacementName,
    hideCompanyNames: profile.hideCompanyNames,
    hideSchoolNames: profile.hideSchoolNames,
    extraStripPaths: (profile.extraStripPaths as string[]) ?? [],
  };
}

pitchDeckPublicRoutes.get("/:token", async (c) => {
  const token = c.req.param("token");
  if (!token) return c.json(error("NOT_FOUND", "Deck not found"), 404);

  const db = getDb();
  const [share] = await db
    .select()
    .from(schema.pitchDeckShares)
    .where(eq(schema.pitchDeckShares.shareToken, token))
    .limit(1);
  if (!share || !share.isActive) return c.json(error("NOT_FOUND", "Deck not found"), 404);
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
    return c.json(error("NOT_FOUND", "Deck not found"), 404);
  }

  const [deck] = await db
    .select()
    .from(schema.pitchDecks)
    .where(eq(schema.pitchDecks.id, share.deckId))
    .limit(1);
  if (!deck) return c.json(error("NOT_FOUND", "Deck not found"), 404);

  // Deck-level brand + default redaction profile.
  const [brandRow, defaultProfile] = await Promise.all([
    deck.whitelabelTenantId
      ? db
          .select({
            name: schema.whitelabelTenants.name,
            subdomain: schema.whitelabelTenants.subdomain,
            primaryColor: schema.whitelabelTenants.primaryColor,
            logoUrl: schema.whitelabelTenants.logoUrl,
            heroHeadline: schema.whitelabelTenants.heroHeadline,
            website: schema.whitelabelTenants.website,
            contactEmail: schema.whitelabelTenants.contactEmail,
          })
          .from(schema.whitelabelTenants)
          .where(eq(schema.whitelabelTenants.id, deck.whitelabelTenantId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    deck.redactionProfileId
      ? db
          .select()
          .from(schema.redactionProfiles)
          .where(eq(schema.redactionProfiles.id, deck.redactionProfileId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  const slides = await db
    .select()
    .from(schema.pitchDeckCandidates)
    .where(eq(schema.pitchDeckCandidates.deckId, deck.id))
    .orderBy(asc(schema.pitchDeckCandidates.displayOrder));

  // Bulk-load every referenced candidate resume and every per-slide
  // redaction profile override in one query each. Keeps the public view
  // O(1) on DB round-trips rather than O(N slides).
  const resumeIds = slides.map((s) => s.candidateResumeId);
  const overrideProfileIds = slides
    .map((s) => s.redactionProfileId)
    .filter((id): id is string => Boolean(id));

  const [resumeRows, overrideProfiles] = await Promise.all([
    resumeIds.length
      ? db
          .select()
          .from(schema.candidateResumes)
          .where(inArray(schema.candidateResumes.id, resumeIds))
      : Promise.resolve([]),
    overrideProfileIds.length
      ? db
          .select()
          .from(schema.redactionProfiles)
          .where(inArray(schema.redactionProfiles.id, overrideProfileIds))
      : Promise.resolve([]),
  ]);

  const resumesById = new Map(resumeRows.map((r) => [r.id, r]));
  const profilesById = new Map(overrideProfiles.map((p) => [p.id, p]));

  const rendered = slides.map((slide) => {
    const resume = resumesById.get(slide.candidateResumeId);
    if (!resume) return null;
    const rules = slide.redactionProfileId
      ? rulesFromProfile(profilesById.get(slide.redactionProfileId) ?? null)
      : rulesFromProfile(defaultProfile);
    const redactedContent = applyRedaction(resume.content as any, rules);
    return {
      id: slide.id,
      displayOrder: slide.displayOrder,
      fitSummary: slide.fitSummary,
      matchScore: slide.matchScore,
      recruiterNotes: slide.recruiterNotes,
      content: redactedContent,
    };
  }).filter((s): s is NonNullable<typeof s> => s !== null);

  // Fire-and-forget view counter.
  db.update(schema.pitchDeckShares)
    .set({
      viewCount: (share.viewCount ?? 0) + 1,
      lastViewedAt: new Date(),
    } as any)
    .where(eq(schema.pitchDeckShares.id, share.id))
    .catch(() => {});

  return c.json(
    success({
      deck: {
        id: deck.id,
        name: deck.name,
        description: deck.description,
        jobId: deck.jobId,
        createdAt: deck.createdAt,
      },
      brand: brandRow,
      slides: rendered,
    }),
    200,
  );
});
