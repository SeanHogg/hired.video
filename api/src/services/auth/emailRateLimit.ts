/**
 * Per-email rate limit — counts recent attempts (success+failure) for
 * a given email in a sliding window and blocks new attempts at the
 * threshold.
 *
 * Why this exists: the per-IP rate limiter ([rateLimiter.ts]) only
 * stops one source. A botnet rotating IPs can still hammer a single
 * email. This fn closes that hole using the existing login_events
 * table — no new infrastructure, no new schema.
 *
 * Single source of truth for the per-email decision. Both the signup
 * handler and the login handler call through here, with different
 * `endpoint` keys so the 5/hour register limit doesn't share a budget
 * with the 20/hour login limit.
 */

import { and, eq, gt, sql } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { recordBotBlock } from "./botBlock.js";

const { loginEvents } = schema;

export interface EmailRateLimitInput {
  db: any;
  email: string;
  endpoint: "register" | "login" | "forgot-password" | "magic-link";
  limit: number;
  windowMs: number;
  countryCode?: string | null;
  ipAddress?: string | null;
}

export const PER_EMAIL_RATE_LIMITS = {
  register: { limit: 5, windowMs: 60 * 60 * 1000 },        // 5/hour
  login: { limit: 20, windowMs: 15 * 60 * 1000 },          // 20/15min
  "forgot-password": { limit: 3, windowMs: 60 * 60 * 1000 }, // 3/hour
  "magic-link": { limit: 5, windowMs: 60 * 60 * 1000 },     // 5/hour
} as const;

/**
 * Returns true if the email has exceeded the threshold and the caller
 * should reject. Records a RATE_LIMIT bot_block event when triggered
 * so the SuperAdmin globe shows the abuse pattern.
 */
export async function isEmailRateLimited(
  input: EmailRateLimitInput,
): Promise<boolean> {
  const { db, email, endpoint, limit, windowMs, countryCode, ipAddress } = input;
  const since = new Date(Date.now() - windowMs);
  const rows = await db
    .select({ id: loginEvents.id })
    .from(loginEvents)
    .where(and(eq(loginEvents.email, email), gt(loginEvents.createdAt, since)));
  if (rows.length < limit) return false;
  await recordBotBlock({
    db,
    endpoint,
    reason: "RATE_LIMIT",
    countryCode: countryCode ?? null,
    ipAddress: ipAddress ?? null,
    email,
  });
  return true;
}

/** Default-config helper — looks up the per-endpoint limits from the
 *  registry so callers don't repeat magic numbers. */
export async function checkEmailRateLimit(
  db: any,
  email: string,
  endpoint: keyof typeof PER_EMAIL_RATE_LIMITS,
  ctx: { countryCode?: string | null; ipAddress?: string | null } = {},
): Promise<boolean> {
  const cfg = PER_EMAIL_RATE_LIMITS[endpoint];
  return isEmailRateLimited({
    db,
    email,
    endpoint,
    limit: cfg.limit,
    windowMs: cfg.windowMs,
    countryCode: ctx.countryCode ?? null,
    ipAddress: ctx.ipAddress ?? null,
  });
}
