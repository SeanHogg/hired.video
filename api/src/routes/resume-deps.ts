/**
 * Production wiring for ResumeDeps — builds the concrete adapters
 * (db port, parser port, diff-recompute port, clock).
 *
 * Tests don't import from here; they build their own deps directly in
 * resume-handlers.test.ts. This file just bridges resume-handlers.ts
 * to the live infrastructure in resumes.ts / services/resume-parse.ts.
 */

import { getDb } from "../db/index.js";
import {
  normalizeJsonResume,
  tryParseJsonResume,
} from "../services/resume-parse.js";
import { refreshDiffPercentFor } from "../handlers/resume-serializer.js";
import type { ResumeDeps, ResumeParserPort, DiffRecomputePort } from "./resume-handlers.js";

/** Concrete parser adapter. parseRawText is supplied by the caller (the
 *  Hono route) since the AI parse needs the request context for the
 *  OpenRouter API key / Cloudflare Workers AI binding. We expose a
 *  factory that takes that function as an argument. */
export function buildResumeParserPort(
  parseRawText: (text: string) => Promise<Record<string, unknown>>,
): ResumeParserPort {
  return {
    parseRawText,
    tryParseJsonResume,
    normalizeJsonResume,
  };
}

const diffRecompute: DiffRecomputePort = {
  refresh: refreshDiffPercentFor as any,
};

/** Build the real, infrastructure-backed ResumeDeps for a request. The
 *  caller supplies `parseRawText` because it needs the Hono context to
 *  resolve the AI provider (CF Workers AI or OpenRouter). */
export function buildResumeDeps(
  parseRawText: (text: string) => Promise<Record<string, unknown>>,
): ResumeDeps {
  return {
    db: getDb(),
    parser: buildResumeParserPort(parseRawText),
    diff: diffRecompute,
    now: () => new Date(),
  };
}
