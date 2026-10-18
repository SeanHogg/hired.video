/**
 * Studio features — voice clone uploads, listings and purchases. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { requirePro } from "../../middleware/tierEnforcement.js";
import { MB, parseUpload, isUploadRejected } from "../../utils/multipart.js";
import { MAX_PRICE_CENTS } from "./voice-clone-shared.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";
import {
  buildVoiceCloneCartLine,
  checkoutVoiceCloneCart,
  claimFreeVoiceClone,
  createVoiceClone,
  deleteVoiceClone,
  recordVoiceClonePlay,
  updateVoiceClone,
} from "../../services/studio/voice-clone-commands.js";

export const voiceCloneWriteRoutes = new Hono<AppEnv>();

// ── POST /voice-clones — upload reference sample, create private clone ──────
// Pro-gated: voice cloning is part of the Pro tier (and the Creator
// Program voice sub-program required to publish to the marketplace also
// requires Pro). Free users hit the 402 PRO_REQUIRED upgrade prompt.
voiceCloneWriteRoutes.post("/voice-clones", requirePro("Voice Cloning"), async (c) => {
  const user = c.var.user;
  const up = await parseUpload(c, {
    fields: ["audio"],
    maxBytes: 25 * MB,
    messages: { missing: "Missing audio sample", size: "Audio sample too large (max 25MB)" },
  });
  // Every rejection (malformed body, missing sample, oversize) is a 400 here.
  if (isUploadRejected(up)) return c.json(error("VALIDATION_ERROR", up.form ? up.message : "Invalid form data"), 400);
  const { form, file: audioFile, bytes } = up;

  const name = String(form.get("name") ?? "My Voice").slice(0, 120);
  const description = String(form.get("description") ?? "").slice(0, 2000) || null;
  const language = (form.get("language") as string | null) || null;
  const gender = (form.get("gender") as string | null) || null;
  const accent = (form.get("accent") as string | null) || null;

  const clone = await createVoiceClone(user.sub, {
    name, description, language, gender, accent,
    audio: { bytes, type: audioFile.type },
  });
  return c.json(success(clone), 201);
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
voiceCloneWriteRoutes.patch("/voice-clones/:id", requirePro("Voice Cloning"), validateJson(VoiceCloneUpdateSchema, (e) => error("VALIDATION_ERROR", "Invalid request body", e.flatten()), { emptyBody: null }), async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const updated = await updateVoiceClone(user.sub, id, body, {
    ip: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  });
  return c.json(success(updated));
});

// ── POST /voice-clones/:id/claim — free listings ────────────────────────────
voiceCloneWriteRoutes.post("/voice-clones/:id/claim", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  await claimFreeVoiceClone(user.sub, id);
  return c.json(success({ licensed: true }));
});

// ── POST /voice-clones/:id/checkout — paid listings ─────────────────────────
// Returns the cart line item shape; the actual Stripe session is created by
// the existing /api/payment/init-collection flow when the cart is checked out.
// We pre-flight by validating the listing here and recording an intent row.
voiceCloneWriteRoutes.post("/voice-clones/:id/checkout", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  return c.json(success({ cartLine: await buildVoiceCloneCartLine(user.sub, id) }));
});

// ── POST /voice-clones/:id/play — analytics counter ─────────────────────────
voiceCloneWriteRoutes.post("/voice-clones/:id/play", async (c) => {
  const id = c.req.param("id");
  await recordVoiceClonePlay(id);
  return c.json(success({ ok: true }));
});

// ── DELETE /voice-clones/:id — owner only ───────────────────────────────────
voiceCloneWriteRoutes.delete("/voice-clones/:id", async (c) => {
  const user = c.var.user;
  const cloneId = c.req.param("id");
  await deleteVoiceClone(user.sub, cloneId);
  return c.json(success({ id: cloneId }));
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

voiceCloneWriteRoutes.post("/voice-clones/cart-checkout", validateJson(VoiceCloneCartCheckoutSchema, (e) => error("VALIDATION_ERROR", "Invalid request body", e.flatten()), { emptyBody: null }), async (c) => {
  const user = c.var.user;
  const body = c.req.valid("json");

  return c.json(success(await checkoutVoiceCloneCart(user.sub, body)), 201);
});
