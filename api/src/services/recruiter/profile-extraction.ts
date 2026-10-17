/**
 * Candidate profile extraction from page HTML (recruiter extension;
 * Loxo-Boost parity). LLM extraction + deterministic contact harvest +
 * per-recruiter dedup + persist (extracted_profiles row and a linked
 * talent_pool_candidates entry), then enqueue job scoring.
 * Route: routes/recruiter/profile-extraction.ts.
 */
import { z } from "zod";
import { DomainError } from "../../domains/errors.js";
import type { LLMClient } from "../adapters/llm-client.js";
import { buildAIErrorEnvelope, type AIErrorEnvelope } from "../adapters/llm-error.js";
import { computeContentHash, normalizeJobUrl } from "../job/JobService.js";
import { signalWork } from "../scheduling/work-signals.js";
import { rowToTalentPoolEntry } from "./talent-pool.js";
import { findTalentPoolEntryById, insertTalentPoolEntry } from "../../repositories/talentPoolRepository.js";
import { findExtractedProfileByHash, insertExtractedProfile } from "../../repositories/extractedProfilesRepository.js";
import { enqueueRecruiterScoringJob } from "../../repositories/recruiterMatchScoresRepository.js";
import { harvestContactsFromHtml, stripHtmlForProfile } from "./profile-html.js";

export const ExtractProfileSchema = z.object({
  html: z.string().min(50),
  sourceUrl: z.string().min(1),
  force: z.boolean().optional(),
});

export const ExtractProfilesBatchSchema = z.object({
  sourceUrl: z.string().min(1),
  cards: z.array(z.string().min(50)).min(1).max(25),
  force: z.boolean().optional(),
});

const ProfileExtractionResponseSchema = z.object({
  name: z.string(),
  title: z.string().optional().default(""),
  company: z.string().optional().default(""),
  location: z.string().optional().default(""),
  skills: z.array(z.string()).optional().default([]),
  experience: z.array(z.object({
    title: z.string().optional().default(""),
    company: z.string().optional().default(""),
    duration: z.string().optional().default(""),
    description: z.string().optional().default(""),
  })).optional().default([]),
  education: z.array(z.object({
    degree: z.string().optional().default(""),
    institution: z.string().optional().default(""),
    year: z.string().optional().default(""),
  })).optional().default([]),
  summary: z.string().optional().default(""),
  // Contact + social enrichment; the populated `email` lands on
  // talent_pool_candidates.candidate_email so the row is reachable at once.
  contactInfo: z.object({
    email: z.string().optional().default(""),
    phone: z.string().optional().default(""),
    linkedin: z.string().optional().default(""),
    github: z.string().optional().default(""),
    twitter: z.string().optional().default(""),
    website: z.string().optional().default(""),
  }).optional().default({ email: "", phone: "", linkedin: "", github: "", twitter: "", website: "" }),
});

type ExtractedProfileData = z.infer<typeof ProfileExtractionResponseSchema>;

export type ProfileExtractionResult =
  | { ok: true; profile: unknown; talentPoolCandidate: unknown; duplicate: boolean }
  | { ok: false; code: string; message: string; envelope?: AIErrorEnvelope };

const EMPTY_PROFILE: ExtractedProfileData = {
  name: "Unknown Candidate",
  title: "", company: "", location: "",
  skills: [], experience: [], education: [], summary: "",
  contactInfo: { email: "", phone: "", linkedin: "", github: "", twitter: "", website: "" },
};

/**
 * Full LLM + contact-harvest + dedup + persist pipeline for ONE profile
 * HTML chunk; shared by the single and batch (#1358) endpoints. Never
 * throws on extraction failure — returns `{ ok:false }` (with the
 * structured AI envelope when the LLM dispatch failed).
 * `makeLlm` null → no provider key → placeholder profile.
 */
export async function extractProfileFromHtml(
  makeLlm: (() => LLMClient) | null,
  opts: { html: string; sourceUrl: string; force?: boolean; recruiterId: string },
): Promise<ProfileExtractionResult> {
  const { html, sourceUrl, force, recruiterId } = opts;
  const normalizedUrl = normalizeJobUrl(sourceUrl) ?? sourceUrl;
  const plainText = stripHtmlForProfile(html);

  let extracted: ExtractedProfileData;
  if (makeLlm) {
    try {
      const llm = makeLlm();
      const { data } = await llm.callJson(
        "recruiter_extract_profile",
        {
          systemPrompt: `You are a professional recruiter extracting candidate information from a web page.
Extract the candidate's profile details and return valid JSON only.
If a field is not found, use an empty string or empty array.`,
          userMessage: `Extract the candidate profile from this page content. Surface any visible contact info or social URLs verbatim — personal email, phone number, and the LinkedIn / GitHub / X (Twitter) / personal-website URLs the page reveals. Use empty strings for anything you cannot find. Never invent contact details.

${plainText}

Return JSON: { "name": "...", "title": "...", "company": "...", "location": "...", "skills": ["..."], "experience": [{"title": "...", "company": "...", "duration": "...", "description": "..."}], "education": [{"degree": "...", "institution": "...", "year": "..."}], "summary": "...", "contactInfo": { "email": "...", "phone": "...", "linkedin": "...", "github": "...", "twitter": "...", "website": "..." } }`,
          responseFormat: "json_object",
          useCase: "company_brief",
        },
        ProfileExtractionResponseSchema,
      );
      extracted = data;
    } catch (err) {
      // Keep the structured AI envelope (correlationId + upgrade banner)
      // for the single route; the batch path just reads `.ok`.
      const envelope = buildAIErrorEnvelope(err);
      if (envelope) return { ok: false, code: envelope.code, message: envelope.message, envelope };
      return { ok: false, code: "AI_ERROR", message: "Failed to extract profile." };
    }
  } else {
    extracted = { ...EMPTY_PROFILE, contactInfo: { ...EMPTY_PROFILE.contactInfo } };
  }

  const harvested = harvestContactsFromHtml(html);
  const contactInfo = {
    email: extracted.contactInfo?.email || harvested.email,
    phone: extracted.contactInfo?.phone || harvested.phone,
    linkedin: extracted.contactInfo?.linkedin || harvested.linkedin,
    github: extracted.contactInfo?.github || harvested.github,
    twitter: extracted.contactInfo?.twitter || harvested.twitter,
    website: extracted.contactInfo?.website || harvested.website,
  };
  extracted.contactInfo = contactInfo;

  // Same normalise-then-SHA-256 fingerprint as job dedup (name|title).
  const contentHash = await computeContentHash(extracted.name, extracted.title);

  if (!force) {
    const existing = await findExtractedProfileByHash(recruiterId, contentHash);
    if (existing) {
      const tp = existing.talentPoolCandidateId ? await findTalentPoolEntryById(existing.talentPoolCandidateId) : null;
      return { ok: true, profile: existing, talentPoolCandidate: tp, duplicate: true };
    }
  }

  const candidate = await insertTalentPoolEntry({
    recruiterId,
    candidateId: recruiterId, // Self-ref until real user ID is known
    candidateName: extracted.name,
    candidateEmail: contactInfo.email || undefined,
    candidateTitle: extracted.title,
    currentCompany: extracted.company || undefined,
    currentTitle: extracted.title || undefined,
    status: "active",
    tags: extracted.skills?.slice(0, 10) ?? [],
    preferredLocations: extracted.location || undefined,
    notes: extracted.summary || undefined,
  });

  const profile = await insertExtractedProfile({
    recruiterId,
    talentPoolCandidateId: candidate.id,
    sourceUrl,
    sourceUrlNormalized: normalizedUrl,
    contentHash,
    extractedData: extracted,
    extractionMethod: "extension",
  });

  try {
    await enqueueRecruiterScoringJob({ type: "recruiter_score_jobs", payload: { recruiterId, candidateId: candidate.id } });
    await signalWork("job-queue");
  } catch { /* non-critical */ }

  return { ok: true, profile, talentPoolCandidate: rowToTalentPoolEntry(candidate), duplicate: false };
}

/** Single-profile use case: AI dispatch failures keep their envelope
 *  status/code/payload; anything else is a generic 500. */
export async function extractProfile(
  makeLlm: (() => LLMClient) | null,
  opts: { html: string; sourceUrl: string; force?: boolean; recruiterId: string },
): Promise<{ profile: unknown; talentPoolCandidate: unknown; duplicate: boolean }> {
  const result = await extractProfileFromHtml(makeLlm, opts);
  if (result.ok === false) {
    if (result.envelope) {
      throw new DomainError(result.envelope.status, result.envelope.code, result.envelope.message, result.envelope.payload);
    }
    throw new DomainError(500, result.code, result.message);
  }
  return { profile: result.profile, talentPoolCandidate: result.talentPoolCandidate, duplicate: result.duplicate };
}

/** Max concurrent per-card LLM extractions in a batch (#1394). */
const BATCH_CONCURRENCY = 5;

/**
 * Bulk capture (#1358): up to 25 cards through the single pipeline with a
 * concurrency cap; per-card failures don't abort the batch. Byte-identical
 * cards collapse to one extraction (dedup is SELECT-then-INSERT with no
 * unique constraint) and repeats are reported as duplicates.
 */
export async function extractProfilesBatch(
  makeLlm: (() => LLMClient) | null,
  opts: { sourceUrl: string; cards: string[]; force?: boolean; recruiterId: string },
) {
  const { sourceUrl, cards, force, recruiterId } = opts;

  const uniqueHtml: string[] = [];
  const htmlToUnique = new Map<string, number>();
  const cardToUnique = cards.map((html) => {
    let u = htmlToUnique.get(html);
    if (u === undefined) {
      u = uniqueHtml.length;
      htmlToUnique.set(html, u);
      uniqueHtml.push(html);
    }
    return u;
  });

  const uniqueResults: ProfileExtractionResult[] = new Array(uniqueHtml.length);
  for (let i = 0; i < uniqueHtml.length; i += BATCH_CONCURRENCY) {
    const slice = uniqueHtml.slice(i, i + BATCH_CONCURRENCY);
    const settled = await Promise.all(
      slice.map((html) => extractProfileFromHtml(makeLlm, { html, sourceUrl, force, recruiterId })),
    );
    settled.forEach((r, j) => { uniqueResults[i + j] = r; });
  }

  const seenUnique = new Set<number>();
  const items: ProfileExtractionResult[] = cardToUnique.map((u) => {
    const r = uniqueResults[u];
    if (seenUnique.has(u)) return r.ok ? { ...r, duplicate: true } : r;
    seenUnique.add(u);
    return r;
  });

  return {
    total: items.length,
    created: items.filter((r) => r.ok && !r.duplicate).length,
    duplicates: items.filter((r) => r.ok && r.duplicate).length,
    failed: items.filter((r) => !r.ok).length,
    items,
  };
}
