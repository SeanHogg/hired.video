/**
 * Shared adapters for the /api/resumes sub-routers: use case → envelope,
 * live ResumeDeps, the per-request viewer context.
 */
import type { Context } from "hono";
import type { AppEnv } from "../../types/index.js";
import { failFromDomainError, toHandlerResult } from "../../handlers/shared.js";
import type { DomainError } from "../../domains/errors.js";
import type { ZodError } from "zod";
import { invalidResumeBody } from "../../services/resume/errors.js";
import { buildResumeDeps } from "../../services/resume/deps.js";
import type { ResumeDeps, ResumeRequestContext } from "../../services/resume/ports.js";
import { ipCountryFromCtx } from "../../services/analytics/artifactView.js";
import { hashClientIp } from "../../utils/crypto.js";
import { parseResumeTextWithAI } from "../resume-parse.js";

export type ResumeCtx = Context<AppEnv>;

/** Await a use case and answer with the envelope (DomainError → its status). */
export async function respond(c: ResumeCtx, run: Promise<unknown>, successStatus = 200): Promise<Response> {
  const result = await toHandlerResult(run, successStatus);
  return c.json(result.body as never, result.status as never);
}

/** Answer with a DomainError's envelope (adapter-level guards). */
export function failWith(c: ResumeCtx, err: DomainError): Response {
  const result = failFromDomainError(err);
  return c.json(result.body as never, result.status as never);
}

/** `validateJson` hook: 400 VALIDATION_ERROR "Invalid request body" + issues. */
export function invalidResumeBodyHook(err: ZodError): never {
  throw invalidResumeBody(err.flatten());
}

/** Live deps; résumé text the parser port sees goes through the AI parse. */
export function resumeDeps(c: ResumeCtx): ResumeDeps {
  return buildResumeDeps((text) => parseResumeTextWithAI(c, text));
}

export function viewerContext(c: ResumeCtx, viewerId: string | null = c.var.userId ?? null): ResumeRequestContext {
  return {
    viewerId,
    ipHash: hashClientIp(c),
    ipCountry: ipCountryFromCtx(c),
    referrer: c.req.header("referer") ?? c.req.header("referrer") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  };
}

export const flag = (v: string | undefined): boolean => v === "1" || v === "true";
