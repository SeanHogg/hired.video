/**
 * Email-change verify flow (hijack-resistant — email only mutates when BOTH
 * confirmations land):
 *   POST /email-change/request               — bearer-auth; sends BOTH emails
 *   GET  /email-change/confirm-current?token= — link from old inbox
 *   GET  /email-change/confirm-new?token=     — link from new inbox
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { verifyBearerJwt } from "../../services/auth/bearerAccount.js";
import { requestEmailChangeForUser, confirmEmailChangeStep } from "../../services/auth/emailChangeFlow.js";
import { runUseCase } from "./http.js";

const RequestEmailChangeSchema = z.object({
  newEmail: z.string().email().transform((e) => e.toLowerCase()),
});

export const emailChangeRoutes = new Hono<AppEnv>();

emailChangeRoutes.post("/email-change/request", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(error("UNAUTHORIZED", "Missing Authorization header"), 401);
  }
  // Only the JWT check maps to 401 here; later failures propagate (unlike
  // withBearerToken, which folds every failure into 401).
  let userId: string;
  try {
    userId = (await verifyBearerJwt(authHeader.slice(7))).sub as string;
  } catch {
    return c.json(error("UNAUTHORIZED", "Invalid or expired token"), 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = RequestEmailChangeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  return runUseCase(c, async () => {
    await requestEmailChangeForUser(userId, parsed.data.newEmail);
    return c.json(success({ requested: true }), 200);
  });
});

emailChangeRoutes.get("/email-change/confirm-current", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json(error("VALIDATION_ERROR", "token is required"), 400);
  return runUseCase(c, async () => c.json(success(await confirmEmailChangeStep("current", token)), 200));
});

emailChangeRoutes.get("/email-change/confirm-new", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json(error("VALIDATION_ERROR", "token is required"), 400);
  return runUseCase(c, async () => c.json(success(await confirmEmailChangeStep("new", token)), 200));
});
