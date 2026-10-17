/** 3-layer job duplicate detection: exact (URL / content hash), fuzzy
 *  candidates, and AI confirmation. normalizeJobUrl lives in
 *  shared/scraping/urls.ts. */
import { z } from "zod";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { LLMClient } from "../adapters/llm-client.js";
import { normalizeJobUrl } from "../../../../shared/scraping/index.js";
import { logger } from "../../lib/logger.js";
import { sha256Hex } from "../../utils/crypto.js";
import { type JobServiceDeps, resolveDeps } from "./job-service-deps.js";
import { type JobEntity, rowToJob } from "./job-entity.js";

const { jobItems } = schema;

/**
 * Compute a short content fingerprint from title + company. Used to
 * catch the same job appearing at two different URLs (e.g. LinkedIn
 * /jobs/view/123 vs /jobs/collections/easy-apply/?currentJobId=123).
 *
 * Uses the Web Crypto API (available in Cloudflare Workers) to produce
 * a hex SHA-256 of the normalized text.
 */
export async function computeContentHash(title?: string, company?: string): Promise<string> {
  const input = [title, company]
    .map((s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''))
    .join('|');
  return sha256Hex(input);
}

/**
 * Layer 2 — fuzzy candidate query. Returns up to 5 rows from job_items
 * whose title and company are close to the input. Uses ILIKE for broad
 * matching (pg_trgm `similarity()` would be better but requires the
 * extension installed — ILIKE works everywhere).
 */
export async function findFuzzyCandidates(title: string, company?: string, limit = 5,
  deps?: Partial<JobServiceDeps>): Promise<JobEntity[]> {
  const d = resolveDeps(deps); const db = d.db;
  const titleWords = title
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);

  if (titleWords.length === 0) return [];

  // Build an OR chain: title ILIKE '%word%' for each significant word,
  // AND company ILIKE '%company%' when present.
  const titleConditions = titleWords.map((w) => ilike(jobItems.title, `%${w}%`));
  const companyClause = company && company.trim().length > 2
    ? ilike(jobItems.company as any, `%${company.trim()}%`)
    : undefined;

  const rows = await db
    .select()
    .from(jobItems)
    .where(
      and(
        eq(jobItems.isActive, true),
        or(...titleConditions),
        companyClause))
    .orderBy(desc(jobItems.createdAt))
    .limit(limit);

  return rows.map(rowToJob);
}

// =====================================================================
// Layer 3 — AI duplicate confirmation
// =====================================================================

const DuplicateCheckSchema = z.object({
  isDuplicate: z.boolean(),
  confidence: z.number().min(0).max(1),
  matchedJobId: z.string().nullable().optional(),
  reason: z.string().optional(),
});

export type DuplicateCheckResult = z.infer<typeof DuplicateCheckSchema>;

/**
 * Ask the LLM to compare a new job against a list of candidates and
 * decide whether any of them is the same posting. Only called when
 * Layer 2 found fuzzy matches but Layer 1 didn't find an exact one.
 *
 * Returns { isDuplicate: true, matchedJobId, confidence } when a match
 * is found, or { isDuplicate: false } otherwise.
 */
export async function aiDuplicateCheck(
  llm: LLMClient,
  newJob: { title: string; company?: string; location?: string; description?: string },
  candidates: JobEntity[],
  featureKey = "job_dedupe_check"): Promise<DuplicateCheckResult> {
  if (candidates.length === 0) return { isDuplicate: false, confidence: 0 };

  const candidateLines = candidates
    .map((c, i) => `[${i}] id="${c.id}" title="${c.title}" company="${c.company ?? ''}" location="${c.location ?? ''}"`)
    .join('\n');

  const systemPrompt = [
    'You compare a NEW job against a list of EXISTING jobs and decide whether any existing job is the same posting.',
    'Two jobs are "the same" if they describe the same role at the same employer, even if the title wording differs slightly (e.g. "Sr. Director" vs "Senior Director", or "AI R&D" vs "AI Research & Development").',
    'They are NOT the same if the employer is different, or if the role is materially different (e.g. "Data Engineer" vs "Data Scientist" at the same company).',
    '',
    'Return ONLY JSON with this shape (no markdown fences):',
    '{ "isDuplicate": boolean, "confidence": 0-1, "matchedJobId": "id of the matching existing job or null", "reason": "one sentence" }',
  ].join('\n');

  const userMessage = [
    'NEW JOB:',
    `  title: ${newJob.title}`,
    `  company: ${newJob.company ?? '(unknown)'}`,
    `  location: ${newJob.location ?? '(unknown)'}`,
    `  description snippet: ${(newJob.description ?? '').slice(0, 500)}`,
    '',
    'EXISTING JOBS:',
    candidateLines,
  ].join('\n');

  const { data } = await llm.callJson(
    featureKey,
    { useCase: 'job_parser', systemPrompt, userMessage, responseFormat: 'json_object' },
    DuplicateCheckSchema);
  return data;
}

// =====================================================================
// Combined dedup pipeline — used by the extract route
// =====================================================================

export interface DedupResult {
  /** 'exact' = Layer 1 hit, 'fuzzy' = Layer 2 hit confirmed by Layer 3, 'new' = no match */
  outcome: 'exact' | 'fuzzy' | 'new';
  existingJob?: JobEntity;
  /** Fuzzy candidates returned to the caller when Layer 2 matches but
   *  Layer 3 is unavailable or below threshold — lets the extension
   *  show a "did you mean?" prompt. */
  candidates?: JobEntity[];
}

export async function deduplicateJob(input: { title: string; company?: string; location?: string; description?: string; sourceUrl?: string },
  llm?: LLMClient | null,
  deps?: Partial<JobServiceDeps>): Promise<DedupResult> {
  const d = resolveDeps(deps); const db = d.db;

  // ---- Layer 1a: normalized URL match ---
  const normalizedUrl = normalizeJobUrl(input.sourceUrl);
  if (normalizedUrl) {
    const [byUrl] = await db
      .select()
      .from(jobItems)
      .where(eq(jobItems.sourceUrl, normalizedUrl))
      .limit(1);
    if (byUrl) return { outcome: 'exact', existingJob: rowToJob(byUrl) };
  }

  // ---- Layer 1b: content hash match ---
  const contentHash = await computeContentHash(input.title, input.company);
  // We'll compare against computed hashes of candidates rather than
  // storing a column for now — the candidate set is small (max 5 rows).

  // ---- Layer 2: fuzzy candidates ---
  const candidates = await findFuzzyCandidates(input.title, input.company);
  if (candidates.length === 0) return { outcome: 'new' };

  // Check content-hash match against candidates (instant, no AI)
  for (const c of candidates) {
    const cHash = await computeContentHash(c.title, c.company);
    if (cHash === contentHash) {
      return { outcome: 'exact', existingJob: c };
    }
  }

  // ---- Layer 3: AI confirmation ---
  if (!llm) {
    // No AI available — return candidates for the extension to show
    return { outcome: 'new', candidates };
  }

  try {
    const result = await aiDuplicateCheck(llm, input, candidates);
    if (result.isDuplicate && result.confidence >= 0.8 && result.matchedJobId) {
      const matched = candidates.find((c) => c.id === result.matchedJobId);
      if (matched) return { outcome: 'fuzzy', existingJob: matched };
    }
    // AI says not a duplicate but candidates exist → return them so
    // extension can still prompt the user.
    if (candidates.length > 0 && result.confidence >= 0.5) {
      return { outcome: 'new', candidates };
    }
  } catch (err) {
    logger.warn("[dedup] AI duplicate check failed, falling open", err);
    // Fall through with candidates so the extension can prompt
    if (candidates.length > 0) return { outcome: 'new', candidates };
  }

  return { outcome: 'new' };
}
