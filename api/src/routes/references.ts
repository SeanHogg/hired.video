/**
 * /api/references — reference management (#1677). Owner-scoped CRUD on
 * reference contacts + selective, NDA-gated, revocable sharing.
 *
 * Owner (authed):
 *   GET    /api/references/contacts
 *   POST   /api/references/contacts
 *   PUT    /api/references/contacts/:id
 *   DELETE /api/references/contacts/:id
 *   GET    /api/references/shares
 *   POST   /api/references/shares          { contactIds, sharedWithEmail, label?, requireNda?, expiresInDays? }
 *   DELETE /api/references/shares/:id       (revoke)
 *
 * Recipient (public, token-gated — registered under PUBLIC_PREFIXES):
 *   GET  /api/references/shared/:token            → metadata + (contacts if unlocked)
 *   POST /api/references/shared/:token/accept-nda → unlock, returns contacts
 *
 * A share is accessible when: not revoked, not expired, and (NDA not
 * required OR NDA accepted). The contact set is the point-in-time snapshot
 * stored on the share. Rules live in services/references/referenceService.ts.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import * as references from "../services/references/referenceService.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const referenceRoutes = new Hono<AppEnv>();

const ContactSchema = z.object({
  name: z.string().min(1).max(200),
  title: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  email: z.string().email().max(255).optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  relationship: z.string().max(120).optional(),
  notes: z.string().max(4000).optional(),
});

// ── Owner: contacts ────────────────────────────────────────────────────
referenceRoutes.get("/contacts", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await references.listContacts(userId)), 200);
});

referenceRoutes.post("/contacts", validateJson(ContactSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const userId = requireUser(c);
  const row = await references.createContact(userId, c.req.valid("json"));
  return c.json(success(row), 201);
});

referenceRoutes.put("/contacts/:id", validateJson(ContactSchema.partial(), (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const userId = requireUser(c);
  const row = await references.updateContact(userId, c.req.param("id"), c.req.valid("json"));
  return c.json(success(row), 200);
});

referenceRoutes.delete("/contacts/:id", async (c) => {
  const userId = requireUser(c);
  const id = c.req.param("id");
  await references.deleteContact(userId, id);
  return c.json(success({ id }), 200);
});

// ── Public: profile reference summaries (PUBLIC_PREFIXES) ───────────────
/**
 * GET /api/references/public/:userId — non-PII reference summaries for the
 * given user's profile References section. Returns name + role context only
 * (NEVER email/phone/notes — those stay behind the NDA-gated share flow).
 * Empty unless the owner opted the `references` section in; cached 120s.
 */
referenceRoutes.get("/public/:userId", async (c) => {
  return c.json(success(await references.listPublicSummaries(c.req.param("userId"))), 200);
});

// ── Owner: shares ──────────────────────────────────────────────────────
const ShareSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(50),
  sharedWithEmail: z.string().email(),
  label: z.string().max(255).optional(),
  requireNda: z.boolean().optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

referenceRoutes.get("/shares", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await references.listShares(userId)), 200);
});

referenceRoutes.post("/shares", validateJson(ShareSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const userId = requireUser(c);
  const row = await references.createShare(userId, c.req.valid("json"));
  return c.json(success(row), 201);
});

referenceRoutes.delete("/shares/:id", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await references.revokeShare(userId, c.req.param("id"))), 200);
});

// ── Recipient: public token view (PUBLIC_PREFIXES) ─────────────────────
referenceRoutes.get("/shared/:token", async (c) => {
  return c.json(success(await references.openSharedPacket(c.req.param("token"))), 200);
});

referenceRoutes.post("/shared/:token/accept-nda", async (c) => {
  return c.json(success(await references.acceptSharedPacketNda(c.req.param("token"))), 200);
});
