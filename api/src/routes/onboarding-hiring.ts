import { Hono } from "hono";
import { getEnv } from "../utils/env.js";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { requirePro } from "../middleware/tierEnforcement.js";
import { hexToBytes, hmacSha256Verify } from "../utils/crypto.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";
import {
  acceptOffer,
  createOffer,
  declineOffer,
  getOffer,
  listOffers,
  markOfferSigned,
  removeOffer,
  sendOffer,
  sendOfferForSignature,
} from "../services/hiring/offer-letters.js";
import {
  completeTask,
  createChecklist,
  getChecklist,
  listChecklists,
} from "../services/hiring/onboarding-checklists.js";

export const hiringOnboardingRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Offer Letters
// ---------------------------------------------------------------------------

const CreateOfferSchema = z.object({
  candidateName: z.string().min(1).max(255),
  candidateEmail: z.string().email(),
  candidateUserId: UuidLikeSchema.optional(),
  jobTitle: z.string().min(1).max(255),
  companyName: z.string().min(1).max(255),
  salary: z.number().positive().optional(),
  currency: z.string().length(3).default("USD"),
  startDate: z.string().datetime().optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  bodyHtml: z.string().min(1),
});

// GET /api/hiring/offers
hiringOnboardingRoutes.get("/offers", requirePro("Hiring & Onboarding"), async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listOffers(userId)), 200);
});

// POST /api/hiring/offers
hiringOnboardingRoutes.post("/offers", requirePro("Hiring & Onboarding"), validateJson(CreateOfferSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const offer = await createOffer(userId, c.req.valid("json"));
  return c.json(success(offer), 201);
});

// GET /api/hiring/offers/:id
hiringOnboardingRoutes.get("/offers/:id", requirePro("Hiring & Onboarding"), async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getOffer(c.req.param("id"), userId)), 200);
});

// PATCH /api/hiring/offers/:id/send
hiringOnboardingRoutes.patch("/offers/:id/send", requirePro("Hiring & Onboarding"), async (c) => {
  const userId = requireUser(c);
  return c.json(success(await sendOffer(c.req.param("id"), userId)), 200);
});

// PATCH /api/hiring/offers/:id/accept  — candidate accepts (public token-based endpoint in future)
hiringOnboardingRoutes.patch("/offers/:id/accept", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const updated = await acceptOffer(id, (body.signatureData ?? null) as string | null);
  return c.json(success(updated), 200);
});

// PATCH /api/hiring/offers/:id/decline
hiringOnboardingRoutes.patch("/offers/:id/decline", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const updated = await declineOffer(id, (body.reason ?? null) as string | null);
  return c.json(success(updated), 200);
});

// DELETE /api/hiring/offers/:id
hiringOnboardingRoutes.delete("/offers/:id", requirePro("Hiring & Onboarding"), async (c) => {
  const userId = requireUser(c);
  await removeOffer(c.req.param("id"), userId);
  return c.json(success({ deleted: true }), 200);
});

// ---------------------------------------------------------------------------
// Onboarding Checklists
// ---------------------------------------------------------------------------

const CreateChecklistSchema = z.object({
  candidateName: z.string().min(1),
  candidateUserId: UuidLikeSchema.optional(),
  offerLetterId: UuidLikeSchema.optional(),
  jobTitle: z.string().optional(),
  startDate: z.string().datetime().optional(),
  tasks: z.array(z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
    dueDate: z.string().datetime().optional(),
  })).min(1),
});

// GET /api/hiring/checklists
hiringOnboardingRoutes.get("/checklists", requirePro("Hiring & Onboarding"), async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listChecklists(userId)), 200);
});

// POST /api/hiring/checklists
hiringOnboardingRoutes.post("/checklists", requirePro("Hiring & Onboarding"), validateJson(CreateChecklistSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const checklist = await createChecklist(userId, c.req.valid("json"));
  return c.json(success(checklist), 201);
});

// GET /api/hiring/checklists/:id
hiringOnboardingRoutes.get("/checklists/:id", requirePro("Hiring & Onboarding"), async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getChecklist(c.req.param("id"), userId)), 200);
});

// PATCH /api/hiring/checklists/:id/tasks/:taskId/complete
hiringOnboardingRoutes.patch("/checklists/:id/tasks/:taskId/complete", requirePro("Hiring & Onboarding"), async (c) => {
  const userId = requireUser(c);
  const result = await completeTask(c.req.param("id"), c.req.param("taskId"), userId);
  return c.json(success(result), 200);
});

// ---------------------------------------------------------------------------
// E-signature integration (#13) — Dropbox Sign (HelloSign) provider
// POST /api/hiring/offers/:id/send-for-signature
// Sends the offer letter to Dropbox Sign for the candidate to sign electronically.
// Requires DROPBOX_SIGN_API_KEY env var; stubs gracefully if absent.
// ---------------------------------------------------------------------------

hiringOnboardingRoutes.post("/offers/:id/send-for-signature", requirePro("E-Signature"), async (c) => {
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  const result = await sendOfferForSignature(
    c.req.param("id"),
    userId,
    { signerName: body.signerName, signerEmail: body.signerEmail },
    getEnv("DROPBOX_SIGN_API_KEY"),
  );
  return c.json(success(result), 200);
});

/**
 * POST /api/hiring/offers/webhook/dropbox-sign
 * Receives Dropbox Sign event webhooks (signature_request_signed, etc.)
 * Verifies HMAC and marks the offer as signed. Raw (non-envelope) bodies.
 */
hiringOnboardingRoutes.post("/offers/webhook/dropbox-sign", async (c) => {
  const rawBody = await c.req.text();
  const sig = c.req.header("x-hello-sign-signature") ?? "";
  const apiKey = getEnv("DROPBOX_SIGN_API_KEY");

  // Verify HMAC-SHA256 signature
  if (apiKey && sig) {
    try {
      const valid = await hmacSha256Verify(apiKey, rawBody, hexToBytes(sig));
      if (!valid) return c.json({ error: "Invalid signature" }, 401);
    } catch { /* non-fatal — log and continue */ }
  }

  let payload: {
    event?: { event_type?: string };
    signature_request?: { metadata?: { offerId?: string } };
  } | null;
  try { payload = JSON.parse(rawBody); } catch { return c.json({ error: "Invalid JSON" }, 400); }

  const event = payload?.event?.event_type ?? "";
  const offerId = payload?.signature_request?.metadata?.offerId ?? "";

  if (event === "signature_request_signed" && offerId) {
    await markOfferSigned(offerId);
  }

  return c.json({ received: true }, 200);
});
