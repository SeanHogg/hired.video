/**
 * Production wiring for ResumeDeps — builds the concrete adapters
 * (repository, parser port, diff-recompute port, clock).
 *
 * Tests don't import from here; they build their own deps directly in
 * resume-handlers.test.ts, typically by constructing a ResumeRepository
 * around the fake-db shim. This file just bridges handlers to the live
 * infrastructure (`getDb()` → ResumeRepository, resume-parse service,
 * resume-view service).
 */

import { getDb } from "../../db/index.js";
import {
  normalizeJsonResume,
  tryParseJsonResume,
} from "../../services/resume/parse.js";
import { refreshDiffPercentFor } from "../../services/resume/view.js";
import { buildRepos, type IResumeRepository } from "../../repositories/index.js";
import { isPromotedWithoutAuth } from "../user/promotionFlags.js";
import type { ResumeDeps, ResumeParserPort, DiffRecomputePort } from "./ports.js";
import { createLLMClient, hasAnyLLMProviderKey, type LLMEnv } from "../adapters/llm-client.js";
import type { JwtPayload } from "../../types/index.js";
import type { MergeFromFileDeps } from "./mergeFromFile.js";
import type { FromJobDeps } from "./from-job-request.js";

/** Concrete parser adapter. parseRawText is supplied by the caller (the
 *  Hono route) since the AI parse needs the request context for the
 *  OpenRouter API key / Cloudflare Workers AI binding. */
export function buildResumeParserPort(
  parseRawText: (text: string) => Promise<Record<string, unknown>>,
): ResumeParserPort {
  return {
    parseRawText,
    tryParseJsonResume,
    normalizeJsonResume,
  };
}

/** Live diff recompute — walks the parent/child relationship via the
 *  repository and writes the recomputed percents back. Tests inject a
 *  stub implementing this same shape that just records the call. */
const diffRecompute: DiffRecomputePort = {
  refresh: refreshDiffPercentFor,
};

/** Build the real, infrastructure-backed ResumeDeps for a request. The
 *  caller supplies `parseRawText` because it needs the Hono context to
 *  resolve the AI provider (CF Workers AI or OpenRouter). */
export function buildResumeDeps(
  parseRawText: (text: string) => Promise<Record<string, unknown>>,
): ResumeDeps {
  const now = () => new Date();
  return {
    repo: buildRepos(getDb(), now).resumes,
    parser: buildResumeParserPort(parseRawText),
    diff: diffRecompute,
    now,
    ownerFlags: { isPromotedWithoutAuth: (ownerId) => isPromotedWithoutAuth(ownerId) },
  };
}

/** Live ports for the merge-from-file use case. The route supplies OCR and
 *  AI parse (both need the request context); the repository and the
 *  merge-refine LLM client are built here. */
export function buildMergeFromFileDeps(
  env: LLMEnv | undefined,
  user: JwtPayload | null | undefined,
  ports: Pick<MergeFromFileDeps, "ocrImage" | "parseText">,
): MergeFromFileDeps {
  return {
    resumes: buildRepos(getDb()).resumes,
    llm: hasAnyLLMProviderKey(env) ? createLLMClient(env, user) : null,
    ...ports,
  };
}

/** Live résumé repository for the HTTP layer (merge, versions, lineage). */
export function liveResumes(): IResumeRepository {
  return buildRepos(getDb()).resumes;
}

/** Live ports for `POST /api/resumes { source: "job" }`. The caller has
 *  already checked that an LLM provider is configured. */
export function buildFromJobDeps(env: LLMEnv | undefined, user: JwtPayload | null | undefined): FromJobDeps {
  const db = getDb();
  return { repo: buildRepos(db).resumes, llm: createLLMClient(env, user), db };
}
