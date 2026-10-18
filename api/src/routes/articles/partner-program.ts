/**
 * Writer Partner Program (#173): opt-in, opt-out, status.
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import {
  getPartnerProgramStatus,
  optInToPartnerProgram,
  optOutOfPartnerProgram,
} from "../../services/articles/partner-program.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";

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

articlePartnerProgramRoutes.post("/partner-program/opt-in", validateJson(OptInSchema, () => error("VALIDATION_ERROR", "Invalid opt-in payload")), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const optIn = await optInToPartnerProgram(userId, {
    legalDocsAccepted: body.legalDocsAccepted,
    proSubscriptionId: body.proSubscriptionId,
    consentIp: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null,
    acceptanceIp: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  });
  return c.json(success({ optIn }), 201);
});

articlePartnerProgramRoutes.post("/partner-program/opt-out", async (c) => {
  const userId = requireUser(c);
  await optOutOfPartnerProgram(userId);
  return c.json(success({ deactivated: true }), 200);
});

articlePartnerProgramRoutes.get("/partner-program/status", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getPartnerProgramStatus(userId)), 200);
});
