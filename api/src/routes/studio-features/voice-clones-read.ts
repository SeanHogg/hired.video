/**
 * Studio features — voice clone marketplace reads. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { and, eq, desc, sql } from "drizzle-orm";
import type { AppEnv } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { filterVisibleCreators, isCreatorVisible } from "../../services/creators/visibility.js";
import { ok, fail, studioVoiceClones, studioVoiceCloneLicenses } from "./shared.js";
import { userHasVoiceLicense } from "./voice-clone-shared.js";

export const voiceCloneReadRoutes = new Hono<AppEnv>();

// ── GET /voice-clones — caller's own clones (owner view) ─────────────────────
voiceCloneReadRoutes.get("/voice-clones", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const clones = await db.select().from(studioVoiceClones)
    .where(eq(studioVoiceClones.userId, user.sub))
    .orderBy(desc(studioVoiceClones.createdAt));
  return c.json(ok(clones));
});

// ── GET /voice-clones/library — every clone the caller can use ──────────────
// Used by VoiceoverPanel to populate the VibeVoice voice picker.
voiceCloneReadRoutes.get("/voice-clones/library", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const rows = await db
    .select({ clone: studioVoiceClones, license: studioVoiceCloneLicenses })
    .from(studioVoiceCloneLicenses)
    .innerJoin(studioVoiceClones, eq(studioVoiceClones.id, studioVoiceCloneLicenses.voiceCloneId))
    .where(eq(studioVoiceCloneLicenses.userId, user.sub))
    .orderBy(desc(studioVoiceCloneLicenses.grantedAt));

  // Return only the synthesis-relevant fields. Sample URL is the load-bearing
  // bit — the client fetches it as the VibeVoice reference.
  const items = rows.map((r) => ({
    id: r.clone.id,
    name: r.clone.name,
    description: r.clone.description,
    sampleAudioUrl: r.clone.sampleAudioUrl,
    previewAudioUrl: r.clone.previewAudioUrl,
    language: r.clone.language,
    gender: r.clone.gender,
    accent: r.clone.accent,
    licenseSource: r.license.source,
    isOwner: r.clone.userId === user.sub,
  }));
  return c.json(ok(items));
});

// ── GET /voice-clones/marketplace — public catalog (no auth) ────────────────
voiceCloneReadRoutes.get("/voice-clones/marketplace", async (c) => {
  const db = getDb();
  const search = String(c.req.query("search") ?? "").trim();
  const language = c.req.query("language") || undefined;
  const gender = c.req.query("gender") || undefined;
  const sort = c.req.query("sort") ?? "popular"; // popular | newest | price_asc | price_desc
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 24)));

  const conds: any[] = [eq(studioVoiceClones.visibility, "public")];
  if (search) {
    conds.push(sql`(${studioVoiceClones.name} ILIKE ${"%" + search + "%"} OR ${studioVoiceClones.description} ILIKE ${"%" + search + "%"})`);
  }
  if (language) conds.push(eq(studioVoiceClones.language, language));
  if (gender) conds.push(eq(studioVoiceClones.gender, gender));

  const order =
    sort === "newest"      ? desc(studioVoiceClones.createdAt)
    : sort === "price_asc" ? sql`${studioVoiceClones.priceCents} ASC`
    : sort === "price_desc"? sql`${studioVoiceClones.priceCents} DESC`
                            : desc(studioVoiceClones.purchaseCount);

  const where = and(...conds);

  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(studioVoiceClones)
    .where(where);
  const total = countRow?.n ?? 0;

  const rows = await db
    .select({
      id: studioVoiceClones.id,
      name: studioVoiceClones.name,
      description: studioVoiceClones.description,
      previewAudioUrl: studioVoiceClones.previewAudioUrl,
      priceCents: studioVoiceClones.priceCents,
      currency: studioVoiceClones.currency,
      language: studioVoiceClones.language,
      gender: studioVoiceClones.gender,
      accent: studioVoiceClones.accent,
      listingSlug: studioVoiceClones.listingSlug,
      playCount: studioVoiceClones.playCount,
      purchaseCount: studioVoiceClones.purchaseCount,
      createdAt: studioVoiceClones.createdAt,
      creatorId: studioVoiceClones.userId,
    })
    .from(studioVoiceClones)
    .where(where)
    .orderBy(order)
    .limit(limit)
    .offset((page - 1) * limit);

  // #314 paywall — hide free creators' clones from the public catalog.
  const visible = await filterVisibleCreators(rows.map((r) => r.creatorId));
  const items = rows.filter((r) => visible.has(r.creatorId));

  return c.json(ok({
    items,
    // `total` is the unfiltered count from `count(*)`; consumers showing
    // pagination chrome will see slight skips when a free creator's
    // listing is excluded from the page. Acceptable until we move the
    // visibility join into the SQL.
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1,
  }));
});

// ── GET /voice-clones/public/by-user/:userId — every public voice clone
// authored by :userId. Used by the public profile (Voice tab). Hidden
// creators (#314 paywall) return an empty list so the consumer renders a
// clean empty state. Same SAFE projection as the marketplace listing
// (sampleAudioUrl/sampleAudioKey omitted — buyers get them after license).
voiceCloneReadRoutes.get("/voice-clones/public/by-user/:userId", async (c) => {
  const userId = c.req.param("userId");
  const db = getDb();
  if (!(await isCreatorVisible(userId))) {
    return c.json(ok({ items: [] as unknown[] }));
  }
  const rows = await db
    .select({
      id: studioVoiceClones.id,
      name: studioVoiceClones.name,
      description: studioVoiceClones.description,
      previewAudioUrl: studioVoiceClones.previewAudioUrl,
      priceCents: studioVoiceClones.priceCents,
      currency: studioVoiceClones.currency,
      language: studioVoiceClones.language,
      gender: studioVoiceClones.gender,
      accent: studioVoiceClones.accent,
      listingSlug: studioVoiceClones.listingSlug,
      playCount: studioVoiceClones.playCount,
      purchaseCount: studioVoiceClones.purchaseCount,
      createdAt: studioVoiceClones.createdAt,
      creatorId: studioVoiceClones.userId,
      platformFeeBps: studioVoiceClones.platformFeeBps,
    })
    .from(studioVoiceClones)
    .where(and(eq(studioVoiceClones.userId, userId), eq(studioVoiceClones.visibility, "public")))
    .orderBy(desc(studioVoiceClones.createdAt));
  return c.json(ok({ items: rows }));
});

// ── GET /voice-clones/public/:id — anonymous-readable public listing ────────
// Mirrors the public-prefix pattern used by /api/studio/public — needed so
// shared marketplace links (`/marketplace/voices/:id`) resolve for users who
// haven't signed in. Returns the SAFE projection only (no sampleAudioUrl /
// sampleAudioKey) and 404s on anything that isn't `visibility = public`. The
// authenticated `/voice-clones/:id` route below still serves owners +
// licensees with the full record.
voiceCloneReadRoutes.get("/voice-clones/public/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const [clone] = await db.select().from(studioVoiceClones)
    .where(eq(studioVoiceClones.id, id))
    .limit(1);
  if (!clone || clone.visibility !== "public") {
    return c.json(fail("NOT_FOUND", "Voice clone not found"), 404);
  }
  // #314 paywall — free creators' clones aren't surfaced on public routes.
  if (!(await isCreatorVisible(clone.userId))) {
    return c.json(fail("NOT_FOUND", "Voice clone not found"), 404);
  }
  return c.json(ok({ ...clone, sampleAudioUrl: null, sampleAudioKey: null }));
});

// ── GET /voice-clones/:id — single clone (owner / public / licensee) ────────
voiceCloneReadRoutes.get("/voice-clones/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.var.user?.sub;
  const db = getDb();

  const [clone] = await db.select().from(studioVoiceClones)
    .where(eq(studioVoiceClones.id, id))
    .limit(1);
  if (!clone) return c.json(fail("NOT_FOUND", "Voice clone not found"), 404);

  const isOwner = userId && clone.userId === userId;
  const isPublic = clone.visibility === "public";
  const isLicensee = userId ? await userHasVoiceLicense(db, userId, id) : false;

  if (!isOwner && !isPublic && !isLicensee) {
    return c.json(fail("FORBIDDEN", "You do not have access to this voice"), 403);
  }

  // Hide the raw sample URL from non-licensees so they can't bypass purchase.
  const safe = isOwner || isLicensee
    ? clone
    : { ...clone, sampleAudioUrl: null, sampleAudioKey: null };
  return c.json(ok(safe));
});
