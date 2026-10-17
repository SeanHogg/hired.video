/**
 * Anonymous AI cap for the signed-out kit workspace. The optional-auth
 * résumé AI surfaces (POST /api/resumes/parse, /extract-text and the
 * `resume-revise` AI tool) share ONE limiter so a visitor can't farm the LLM
 * by rotating endpoints: 10 calls / IP / hour. Authed callers skip it — the
 * services processor + token budget meter them instead.
 */
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/index.js";
import { createIpRateLimiter } from "./rateLimiter.js";

const anonResumeAiLimiter = createIpRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxAttempts: 10,
  message: "Too many resume parses from this network. Create a free account to keep going.",
});

export const anonResumeAiGate: MiddlewareHandler<AppEnv> = async (c, next) =>
  c.var.user?.sub ? next() : anonResumeAiLimiter(c, next);
