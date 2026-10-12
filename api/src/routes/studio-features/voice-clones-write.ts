/**
 * Studio features — voice clone uploads, listings and purchases. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { and, eq, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";
import { findLicensedVoiceCloneIds, grantFreeVoiceCloneLicenses } from "../../repositories/studioFeaturesRepository.js";
import { requirePro } from "../../middleware/tierEnforcement.js";
import { cdnUrl } from "../../utils/cdn.js";
import { slugify } from "../../../../shared/slugify.js";
import { deleteR2Keys } from "../../services/storage/r2-delete.js";
import { putObject } from "../../services/storage/object-store.js";
import { ok, fail, studioVoiceClones, studioVoiceCloneLicenses } from "./shared.js";
import { PLATFORM_FEE_BPS_DEFAULT, MAX_PRICE_CENTS, resolveCreatorFeeBps, userHasVoiceLicense } from "./voice-clone-shared.js";

export const voiceCloneWriteRoutes = new Hono<AppEnv>();

// ── POST /voice-clones — upload reference sample, create private clone ──────
// Pro-gated: voice cloning is part of the Pro tier (and the Creator
// Program voice sub-program required to publish to the marketplace also
// requires Pro). Free users hit the 402 PRO_REQUIRED upgrade prompt.
voiceCloneWriteRoutes.post("/voice-clones", requirePro("Voice Cloning"), async (c) => {
  const user = c.var.user;
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json(fail("VALIDATION_ERROR", "Invalid form data"), 400);

  const name = String(form.get("name") ?? "My Voice").slice(0, 120);
  const description = String(form.get("description") ?? "").slice(0, 2000) || null;
  const language = (form.get("language") as string | null) || null;
  const gender = (form.get("gender") as string | null) || null;
  const accent = (form.get("accent") as string | null) || null;
  const audioFile = form.get("audio") as File | null;
  if (!audioFile) return c.json(fail("VALIDATION_ERROR", "Missing audio sample"), 400);
  if (audioFile.size > 25 * 1024 * 1024) {
    return c.json(fail("VALIDATION_ERROR", "Audio sample too large (max 25MB)"), 400);
  }

  const db = getDb();
  const id = crypto.randomUUID();

  // Upload reference sample to object storage
  const ext = (audioFile.type.split("/")[1] || "webm").replace(/[^a-z0-9]/gi, "");
  const sampleKey = `studio/voice-clones/${user.sub}/${id}.${ext}`;
  const bytes = await audioFile.arrayBuffer();
  const uploaded = await putObject(sampleKey, bytes, audioFile.type || "audio/webm", { userId: user.sub, cloneId: id });
  if (!uploaded) return c.json(fail("STORAGE_UNAVAILABLE", "Failed to store voice sample"), 503);
  const sampleUrl = cdnUrl(sampleKey);

  const [clone] = await db.insert(studioVoiceClones).values({
    id,
    userId: user.sub,
    name,
    description,
    sampleAudioUrl: sampleUrl,
    sampleAudioKey: sampleKey,
    language,
    gender,
    accent,
    visibility: "private",
    status: "ready",
  } as any).returning();

  // Auto-grant the owner a usage license so they can use their own voice.
  await db.insert(studioVoiceCloneLicenses).values({
    userId: user.sub,
    voiceCloneId: clone.id,
    source: "owner",
  } as any).onConflictDoNothing();

  bumpSearchVersion();
  return c.json(ok(clone), 201);
});

// ── PATCH /voice-clones/:id — edit metadata + publish/unpublish + set price ─
const VoiceCloneUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  language: z.string().max(20).nullable().optional(),
  gender: z.enum(["male", "female", "nonbinary"]).nullable().optional(),
  accent: z.string().max(60).nullable().optional(),
  visibility: z.enum(["private", "unlisted", "public"]).optional(),
  priceCents: z.number().int().min(0).max(MAX_PRICE_CENTS).optional(),
  currency: z.enum(["USD"]).optional(),
  /** Required when transitioning to `public` for the first time. */
  consentAccepted: z.boolean().optional(),
  previewAudioBase64: z.string().optional(), // optional pre-rendered preview
  previewAudioMime:   z.string().optional(),
});

// PATCH is gated alongside POST: editing metadata, transitioning to
// `public`, and setting a marketplace price are all Pro-tier actions.
// Pure unpublish (public → private) by a downgraded user is rare enough
// that we don't carve out a special case — they can still DELETE.
voiceCloneWriteRoutes.patch("/voice-clones/:id", requirePro("Voice Cloning"), async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = VoiceCloneUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);

  const db = getDb();
  const [existing] = await db.select().from(studioVoiceClones)
    .where(and(eq(studioVoiceClones.id, id), eq(studioVoiceClones.userId, user.sub)))
    .limit(1);
  if (!existing) return c.json(fail("NOT_FOUND", "Voice clone not found"), 404);

  const patch: Record<string, any> = { updatedAt: new Date() };
  for (const k of ["name", "description", "language", "gender", "accent", "priceCents", "currency"] as const) {
    if (parsed.data[k] !== undefined) patch[k] = parsed.data[k];
  }

  // Visibility transition: enforce consent on first publish.
  if (parsed.data.visibility !== undefined && parsed.data.visibility !== existing.visibility) {
    if (parsed.data.visibility === "public") {
      if (!parsed.data.consentAccepted && !existing.consentAgreedAt) {
        return c.json(fail("CONSENT_REQUIRED", "You must accept the voice marketplace creator terms before publishing."), 400);
      }
      if (parsed.data.consentAccepted && !existing.consentAgreedAt) {
        patch.consentAgreedAt = new Date();
        patch.consentIp = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null;
        patch.consentUa = c.req.header("user-agent") ?? null;
      }
      // Generate slug on first publish.
      if (!existing.listingSlug) {
        patch.listingSlug = `${slugify(parsed.data.name ?? existing.name, { fallback: "voice" })}-${id.slice(0, 6)}`;
      }
      patch.platformFeeBps = existing.platformFeeBps ?? (await resolveCreatorFeeBps(user.sub));
    }
    patch.visibility = parsed.data.visibility;
  }

  // Optional preview audio upload (client renders a short sample with Kokoro/
  // VibeVoice and uploads it base64 so the marketplace catalog has audio).
  if (parsed.data.previewAudioBase64) {
    const mime = parsed.data.previewAudioMime || "audio/wav";
    const ext = mime.split("/")[1] || "wav";
    const previewKey = `studio/voice-clones/${user.sub}/${id}-preview.${ext}`;
    const buf = Uint8Array.from(atob(parsed.data.previewAudioBase64), (ch) => ch.charCodeAt(0)).buffer;
    if (await putObject(previewKey, buf, mime)) {
      // Reclaim the previous preview if the new key replaces (rather than
      // overwrites) it — different mimes write to different extensions.
      if (existing.previewAudioKey && existing.previewAudioKey !== previewKey) {
        await deleteR2Keys([existing.previewAudioKey]);
      }
      patch.previewAudioUrl = cdnUrl(previewKey);
      patch.previewAudioKey = previewKey;
    }
  }

  // Defense-in-depth: include userId in the UPDATE WHERE clause so that a
  // future refactor that drops the existence check above can't silently
  // become an authorization bypass.
  const [updated] = await db.update(studioVoiceClones)
    .set(patch as any)
    .where(and(eq(studioVoiceClones.id, id), eq(studioVoiceClones.userId, user.sub)))
    .returning();
  bumpSearchVersion();
  return c.json(ok(updated));
});

// ── POST /voice-clones/:id/claim — free listings ────────────────────────────
voiceCloneWriteRoutes.post("/voice-clones/:id/claim", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();

  const [clone] = await db.select().from(studioVoiceClones).where(eq(studioVoiceClones.id, id)).limit(1);
  if (!clone) return c.json(fail("NOT_FOUND", "Voice not found"), 404);
  if (clone.visibility !== "public") return c.json(fail("FORBIDDEN", "Voice is not publicly listed"), 403);
  if (clone.priceCents > 0) return c.json(fail("PAYMENT_REQUIRED", "This voice requires purchase"), 402);

  await db.insert(studioVoiceCloneLicenses).values({
    userId: user.sub,
    voiceCloneId: id,
    source: "free",
  } as any).onConflictDoNothing();

  return c.json(ok({ licensed: true }));
});

// ── POST /voice-clones/:id/checkout — paid listings ─────────────────────────
// Returns the cart line item shape; the actual Stripe session is created by
// the existing /api/payment/init-collection flow when the cart is checked out.
// We pre-flight by validating the listing here and recording an intent row.
voiceCloneWriteRoutes.post("/voice-clones/:id/checkout", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();

  const [clone] = await db.select().from(studioVoiceClones).where(eq(studioVoiceClones.id, id)).limit(1);
  if (!clone) return c.json(fail("NOT_FOUND", "Voice not found"), 404);
  if (clone.visibility !== "public") return c.json(fail("FORBIDDEN", "Voice is not publicly listed"), 403);
  if (clone.userId === user.sub) return c.json(fail("ALREADY_OWNED", "You already own this voice"), 409);
  if (await userHasVoiceLicense(db, user.sub, id)) {
    return c.json(fail("ALREADY_LICENSED", "You already have a license for this voice"), 409);
  }

  return c.json(ok({
    cartLine: {
      type: "voice_clone",
      voiceCloneId: clone.id,
      name: clone.name,
      priceCents: clone.priceCents,
      currency: clone.currency,
      creatorId: clone.userId,
      platformFeeBps: clone.platformFeeBps,
    },
  }));
});

// ── POST /voice-clones/:id/play — analytics counter ─────────────────────────
voiceCloneWriteRoutes.post("/voice-clones/:id/play", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  await db.update(studioVoiceClones)
    .set({ playCount: sql`${studioVoiceClones.playCount} + 1` } as any)
    .where(eq(studioVoiceClones.id, id));
  return c.json(ok({ ok: true }));
});

// ── DELETE /voice-clones/:id — owner only ───────────────────────────────────
voiceCloneWriteRoutes.delete("/voice-clones/:id", async (c) => {
  const user = c.var.user;
  const cloneId = c.req.param("id");
  const db = getDb();

  const [deleted] = await db.delete(studioVoiceClones)
    .where(and(eq(studioVoiceClones.id, cloneId), eq(studioVoiceClones.userId, user.sub)))
    .returning();

  if (!deleted) return c.json(fail("NOT_FOUND", "Voice clone not found"), 404);
  // Cascade-delete licenses for this clone.
  await db.delete(studioVoiceCloneLicenses).where(eq(studioVoiceCloneLicenses.voiceCloneId, cloneId));
  // Cascade-delete the R2 audio. Without this, every deleted clone leaks two
  // objects (sample + preview) into the bucket — the orphan sweep would
  // re-flag them but admins shouldn't have to manually reclaim per-row.
  await deleteR2Keys([deleted.sampleAudioKey, deleted.previewAudioKey]);
  bumpSearchVersion();
  return c.json(ok({ id: cloneId }));
});

// ── POST /voice-clones/cart-checkout — finalize a cart of voice clone purchases
//
// Called by frontend Checkout after the user submits their cart. Validates
// every line item against the live listing (price + visibility), then either:
//   • Free items (priceCents == 0) → grant 'free' license immediately
//   • Paid items (priceCents  > 0) → require `paymentRef` proving the cart
//     was charged via the existing payment provider. The webhook in
//     routes/payment.ts is the canonical grant path once Stripe one-off
//     charges (Stripe Elements) are wired in; this endpoint exists so the
//     frontend can drive the flow without a webhook round-trip in development.
const VoiceCloneCartCheckoutSchema = z.object({
  items: z.array(z.object({
    voiceCloneId: UuidLikeSchema,
    expectedPriceCents: z.number().int().min(0),
  })).min(1).max(50),
  /** Provider charge reference (Stripe payment_intent ID, etc.).
   *  Required if any item has price > 0. */
  paymentRef: z.string().min(1).optional(),
});

voiceCloneWriteRoutes.post("/voice-clones/cart-checkout", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = VoiceCloneCartCheckoutSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);

  const db = getDb();
  const ids = parsed.data.items.map((i) => i.voiceCloneId);
  const listings = await db.select().from(studioVoiceClones)
    .where(inArray(studioVoiceClones.id, ids));
  const byId = new Map(listings.map((l) => [l.id, l]));

  // Existing licenses for the whole cart in ONE query (was one per item).
  const alreadyLicensed = await findLicensedVoiceCloneIds(db, user.sub, ids);

  // Validate every line item
  let paidTotal = 0;
  for (const item of parsed.data.items) {
    const clone = byId.get(item.voiceCloneId);
    if (!clone) return c.json(fail("NOT_FOUND", `Voice ${item.voiceCloneId} not found`), 404);
    if (clone.visibility !== "public") return c.json(fail("FORBIDDEN", `Voice ${clone.name} is no longer listed`), 403);
    if (clone.userId === user.sub) return c.json(fail("ALREADY_OWNED", `You own ${clone.name}`), 409);
    if (clone.priceCents !== item.expectedPriceCents) {
      return c.json(fail("PRICE_CHANGED", `Price changed for ${clone.name}`, { current: clone.priceCents }), 409);
    }
    if (alreadyLicensed.has(clone.id)) {
      return c.json(fail("ALREADY_LICENSED", `You already own ${clone.name}`), 409);
    }
    paidTotal += clone.priceCents;
  }

  // Paid carts must come with a provider charge reference. Free carts can
  // proceed immediately. The frontend's Stripe Elements / Helcim widget is
  // responsible for collecting paymentRef before calling this endpoint.
  if (paidTotal > 0 && !parsed.data.paymentRef) {
    return c.json(fail("PAYMENT_REQUIRED", "paymentRef required for paid items"), 402);
  }

  // Free items: one multi-row insert for the whole cart.
  const freeIds = parsed.data.items
    .map((item) => byId.get(item.voiceCloneId)!)
    .filter((clone) => clone.priceCents === 0)
    .map((clone) => clone.id);
  await grantFreeVoiceCloneLicenses(db, user.sub, freeIds);

  const granted: Array<{ voiceCloneId: string; source: string }> = [];
  for (const item of parsed.data.items) {
    const clone = byId.get(item.voiceCloneId)!;
    if (clone.priceCents === 0) {
      granted.push({ voiceCloneId: clone.id, source: "free" });
    } else {
      await grantVoiceClonePurchaseLicense(clone.id, user.sub, clone.priceCents, parsed.data.paymentRef!);
      granted.push({ voiceCloneId: clone.id, source: "purchase" });
    }
  }

  return c.json(ok({ granted }), 201);
});

/**
 * Internal helper exported for the payment webhook (see routes/payment.ts):
 * grants a license to `userId` on a successful purchase, splits the payment
 * into creator/platform cuts based on the listing's `platformFeeBps`, and
 * bumps `purchase_count`. Idempotent on (user_id, voice_clone_id).
 */
export async function grantVoiceClonePurchaseLicense(
  voiceCloneId: string,
  userId: string,
  pricePaidCents: number,
  paymentRef: string,
): Promise<void> {
  const db = getDb();
  const [clone] = await db.select().from(studioVoiceClones).where(eq(studioVoiceClones.id, voiceCloneId)).limit(1);
  if (!clone) return;
  const feeBps = clone.platformFeeBps ?? PLATFORM_FEE_BPS_DEFAULT;
  const platformCut = Math.round((pricePaidCents * feeBps) / 10_000);
  const creatorCut = pricePaidCents - platformCut;

  await db.insert(studioVoiceCloneLicenses).values({
    userId,
    voiceCloneId,
    source: "purchase",
    pricePaidCents,
    creatorCutCents: creatorCut,
    platformCutCents: platformCut,
    paymentRef,
  } as any).onConflictDoNothing();

  await db.update(studioVoiceClones)
    .set({ purchaseCount: sql`${studioVoiceClones.purchaseCount} + 1` } as any)
    .where(eq(studioVoiceClones.id, voiceCloneId));
}
