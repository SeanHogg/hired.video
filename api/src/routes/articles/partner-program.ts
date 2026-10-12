/**
 * Writer Partner Program (#173): opt-in, opt-out, status.
 */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";
import { LegalRepository } from "../../repositories/legalRepository.js";
import { uid } from "./shared.js";

const { articles, partnerProgramOptIns, partnerProgramBalances } = schema;

export const articlePartnerProgramRoutes = new Hono<AppEnv>();

// ===========================================================================
// #173 — Writer Partner Program opt-in. Mirrors voice-clone consent.
// ===========================================================================

export const OptInSchema = z.object({
  legalDocsAccepted: z.array(UuidLikeSchema).default([]),
  /** Optional explicit Pro subscription id; default behaviour pulls it
   *  from the user's active sub at opt-in time. */
  proSubscriptionId: UuidLikeSchema.optional(),
});

articlePartnerProgramRoutes.post("/partner-program/opt-in", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const parsed = OptInSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid opt-in payload"), 400);
  const db = getDb();

  // Deactivate any existing active row before inserting the new one
  // (unique partial index guards a second active row at the DB level).
  await db.update(partnerProgramOptIns)
    .set({ isActive: false, deactivatedAt: new Date(), deactivatedReason: "superseded" })
    .where(and(
      eq(partnerProgramOptIns.userId, userId),
      eq(partnerProgramOptIns.isActive, true),
    ));

  const [inserted] = await db.insert(partnerProgramOptIns).values({
    userId,
    legalDocsAccepted: parsed.data.legalDocsAccepted as any,
    consentIp: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null,
    consentUa: c.req.header("user-agent") ?? null,
    proSubscriptionId: parsed.data.proSubscriptionId,
    isActive: true,
  } as any).returning();

  // Write a legal_document_acceptances row for every doc id in the
  // payload so the audit trail mirrors the gift-card / voice-clone
  // consent flow. Soft-fails on a missing doc — the opt-in row is the
  // primary record.
  const ip = c.req.header("cf-connecting-ip") ?? null;
  const userAgent = c.req.header("user-agent") ?? null;
  await new LegalRepository(db).insertAcceptancesSoft(
    parsed.data.legalDocsAccepted.map((docId) => ({
      userId,
      documentId: docId,
      kind: "partner_program_terms",
      version: "snapshot",
      ip,
      userAgent,
      context: "partner_program_opt_in",
    })),
    "articles partner-program opt-in",
  );

  return c.json(success({ optIn: inserted }), 201);
});

articlePartnerProgramRoutes.post("/partner-program/opt-out", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  await db.update(partnerProgramOptIns)
    .set({ isActive: false, deactivatedAt: new Date(), deactivatedReason: "user_opted_out" })
    .where(and(
      eq(partnerProgramOptIns.userId, userId),
      eq(partnerProgramOptIns.isActive, true),
    ));
  return c.json(success({ deactivated: true }), 200);
});

articlePartnerProgramRoutes.get("/partner-program/status", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [optIn] = await db.select().from(partnerProgramOptIns)
    .where(and(
      eq(partnerProgramOptIns.userId, userId),
      eq(partnerProgramOptIns.isActive, true),
    ))
    .limit(1);
  const [balance] = await db.select().from(partnerProgramBalances)
    .where(eq(partnerProgramBalances.userId, userId))
    .limit(1);
  return c.json(success({ optIn: optIn ?? null, balance: balance ?? null }), 200);
});
