/** LLM-backed job-page classification + structured extraction / enrichment. */
import { z } from "zod";
import type { LLMClient } from "../adapters/llm-client.js";
import { htmlToMarkdown } from "../../../../shared/scraping/index.js";
import { logger } from "../../lib/logger.js";
import { type ParsedJob, parseJobFromPage } from "./job-page-parse.js";
import { splitDescriptionSections } from "./job-description-sections.js";
import { HIRED_VIDEO_SEED_COMPANY } from "./job-seed-company.js";

const ClassificationSchema = z.object({
  isJobPosting: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
  job: z
    .object({
      title: z.string().optional(),
      company: z.string().optional(),
      location: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      description: z.string().optional(),
      isRemote: z.boolean().optional(),
      jobType: z.string().optional(),
      experienceLevel: z.string().optional(),
      salaryMin: z.number().nullable().optional(),
      salaryMax: z.number().nullable().optional(),
      salaryCurrency: z.string().optional(),
      skills: z.array(z.string()).optional(),
      responsibilities: z.array(z.string()).optional(),
      requirements: z.array(z.string()).optional(),
      qualifications: z.array(z.string()).optional(),
      benefits: z.array(z.string()).optional(),
      applyUrl: z.string().optional(),
    })
    .nullable()
    .optional(),
});

export type JobClassification = z.infer<typeof ClassificationSchema>;

/** Threshold below which we reject the page as "not a job". */
const CLASSIFICATION_THRESHOLD = 0.7;

/**
 * Use the LLM to decide whether a page is a job posting and, if so,
 * extract structured fields from it. Used as the second pass in
 * `extractAndClassifyJob` when JSON-LD wasn't available.
 */
async function classifyWithLLM(
  llm: LLMClient,
  input: { url: string; markdown: string; hint: ParsedJob },
  featureKey = "job_classify"): Promise<JobClassification> {
  // The caller has already converted HTML → Markdown so paragraph breaks,
  // bullet lists, and section headers (`**Qualifications**`, `## About`,
  // etc.) are all intact. Slice generously — we want enough room for
  // long descriptions.
  const markdown = input.markdown.slice(0, 16_000);

  const systemPrompt = [
    "You are a strict classifier and structured-extractor for job postings.",
    "Your input is a Markdown document (not HTML) derived from a job page. Paragraph breaks, bullet lists (- item), and bold section headers (**Qualifications**, **Benefits**, etc.) carry meaning — use them.",
    "",
    "STEP 1 — classify: decide whether the input describes a single job posting.",
    "  ACCEPT (isJobPosting=true) when:",
    "    - The text describes one specific role with responsibilities and/or requirements.",
    "    - The role does not need an explicit 'Title:' line — infer the title from phrases like 'We're looking for a Senior Product Manager' or from a bold heading that names the role.",
    "  REJECT (isJobPosting=false) when:",
    "    - There is no single dominant role — the text is a search results list, a company homepage, an article about jobs, a resume, or a profile.",
    "",
    "STEP 2 — if accepted, extract the fields below. Rules:",
    "  - Never invent data. Use null for missing scalars and [] for missing lists.",
    "  - title: infer from role mentions in the body text when no explicit title line exists. Title-case it (e.g. 'Senior Product And AI Leader').",
    "  - company: infer from 'About <Company>' sections, possessive mentions ('<Company>'s goal', 'at <Company>'), or sign-offs. Return the employer name only — not the job board (LinkedIn, Indeed, etc).",
    "  - description: the FULL multi-paragraph role description as Markdown. Preserve paragraph breaks with actual \\n\\n between paragraphs. Keep **bold** on inline section labels. DO NOT duplicate content that belongs in responsibilities/requirements/qualifications/benefits — those should be pulled into their own arrays and removed from the description body. Aim for 2-6 paragraphs that cover the company pitch, the mission of the role, and any context that isn't a bulleted list.",
    "  - responsibilities: every bullet under headings like 'What You'll Do', 'Responsibilities', 'The Role', 'Product Leadership', 'AI Acceleration', etc. Merge sub-sections when they are clearly part of the same 'what you will do' block.",
    "  - requirements: bullets under 'Requirements', 'What We're Looking For', 'Must Have', 'Basic Qualifications'.",
    "  - qualifications: bullets under 'Qualifications', 'Preferred Qualifications', 'Nice To Have', 'Bonus If You Have', 'Education'.",
    "  - benefits: bullets under 'Benefits', 'Perks', 'What We Offer', 'Compensation'. Include salary range lines.",
    "  - skills: concrete technologies, tools, or hard skills mentioned anywhere (e.g. ['TypeScript','AWS','LLM platforms','Product management']).",
    "  - applyUrl: the direct application URL if one is mentioned or linked in the text (e.g. 'Apply at https://workday.com/homedepot/apply/123'). This is often a different domain from where the job is posted (Workday, Greenhouse, Lever, etc.). null if not found.",
    "",
    "Return ONLY a JSON object with this exact shape (no markdown fences, no commentary):",
    "{",
    '  "isJobPosting": boolean,',
    '  "confidence": number between 0 and 1,',
    '  "reason": short string (1 sentence) explaining the decision,',
    '  "job": {',
    '    "title": string,',
    '    "company": string,',
    '    "location": string — human-readable, e.g. "San Francisco, CA" or "Remote",',
    '    "city": string,',
    '    "state": string,',
    '    "country": string,',
    '    "isRemote": boolean,',
    '    "jobType": one of ["full_time","part_time","contract","temporary","internship","volunteer"],',
    '    "experienceLevel": one of ["entry","mid","senior","executive"],',
    '    "salaryMin": annual base salary minimum in dollars (number, no formatting),',
    '    "salaryMax": annual base salary maximum in dollars (number, no formatting),',
    '    "salaryCurrency": ISO 4217 code, default "USD",',
    '    "description": multi-paragraph Markdown string, paragraph breaks with \\n\\n,',
    '    "responsibilities": string[],',
    '    "requirements": string[],',
    '    "qualifications": string[],',
    '    "benefits": string[],',
    '    "skills": string[],',
    '    "applyUrl": string or null — direct application URL if found',
    "  }",
    "}",
    "",
    'When isJobPosting is false, set "job" to null.',
  ].join("\n");

  const userMessage = [
    `URL: ${input.url}`,
    `Hint title: ${input.hint.title || "(none)"}`,
    `Hint company: ${input.hint.company || "(none)"}`,
    "",
    "--- MARKDOWN ---",
    markdown,
    "--- END MARKDOWN ---",
  ].join("\n");

  const { data } = await llm.callJson(
    featureKey,
    {
      useCase: "job_parser",
      systemPrompt,
      userMessage,
      responseFormat: "json_object",
    },
    ClassificationSchema);
  return data;
}

export interface JobExtractionResult {
  ok: boolean;
  /** Reason for rejection — only present when ok=false. */
  reason?: string;
  /** Confidence score (0-1) for telemetry. */
  confidence: number;
  parsed?: ParsedJob;
}

/**
 * Full pipeline used by POST /api/jobs/extract:
 *   1. parseJobFromPage (JSON-LD / OG / heuristics).
 *   2. If JSON-LD found a JobPosting → high confidence, accept.
 *   3. Otherwise call the LLM classifier; reject if !isJobPosting
 *      or if confidence < CLASSIFICATION_THRESHOLD.
 *
 * Falls open (accepts the heuristic parse) when no API key is
 * configured, so dev environments without OpenRouter still work.
 */
/**
 * Run the LLM classifier against `html` and merge its output INTO an
 * already-parsed job — filling fields the first pass left empty.
 *
 * Why this exists: JSON-LD JobPosting is the gold-standard first pass,
 * but many ATSes (notably Home Depot's careers site) emit it with only
 * title / company / location / description — no jobType, salary,
 * experienceLevel, or skills. `extractAndClassifyJob` shortcuts on the
 * JSON-LD hit and skips the LLM, so those fields stay null forever.
 *
 * The /refresh path calls this to take a second pass with the LLM,
 * preserving every field the heuristic already got right and only
 * filling what's missing. Heuristic wins on conflict.
 */
export async function enrichParsedWithLLM(
  parsed: ParsedJob,
  input: { url?: string; html?: string; llm: LLMClient }): Promise<ParsedJob> {
  const markdown = htmlToMarkdown(input.html);
  if (!markdown || markdown.length < 200) return parsed;

  let classification: JobClassification;
  try {
    classification = await classifyWithLLM(input.llm, {
      url: input.url ?? "",
      markdown,
      hint: parsed,
    }, "job_enrich");
  } catch (err) {
    logger.warn("[jobs/enrich] LLM enrichment failed, returning original parse", err);
    return parsed;
  }

  if (!classification.isJobPosting || !classification.job) return parsed;

  const ai = classification.job;
  return {
    ...parsed,
    // Preserve heuristic's high-confidence fields; only fill holes.
    jobType: parsed.jobType || ai.jobType || undefined,
    experienceLevel: parsed.experienceLevel || ai.experienceLevel || undefined,
    salaryMin: parsed.salaryMin ?? ai.salaryMin ?? undefined,
    salaryMax: parsed.salaryMax ?? ai.salaryMax ?? undefined,
    salaryCurrency: parsed.salaryCurrency || ai.salaryCurrency,
    skills: parsed.skills && parsed.skills.length > 0 ? parsed.skills : ai.skills,
    responsibilities:
      parsed.responsibilities && parsed.responsibilities.length > 0
        ? parsed.responsibilities
        : ai.responsibilities,
    requirements:
      parsed.requirements && parsed.requirements.length > 0
        ? parsed.requirements
        : ai.requirements,
    qualifications:
      parsed.qualifications && parsed.qualifications.length > 0
        ? parsed.qualifications
        : ai.qualifications,
    benefits: parsed.benefits && parsed.benefits.length > 0 ? parsed.benefits : ai.benefits,
    applyUrl: parsed.applyUrl || ai.applyUrl,
    isRemote: parsed.isRemote ?? ai.isRemote,
  };
}

export async function extractAndClassifyJob(input: {
  url?: string;
  html?: string;
  llm?: LLMClient | null;
}): Promise<JobExtractionResult> {
  const heuristic = parseJobFromPage({ url: input.url, html: input.html });

  if (heuristic.confidence === "high") {
    return { ok: true, confidence: 1, parsed: splitDescriptionSections(heuristic) };
  }

  // No JSON-LD. Convert HTML → Markdown once; we pass the same MD to
  // the LLM and keep it around as the heuristic description fallback.
  const markdown = htmlToMarkdown(input.html);

  // No AI configured — accept the heuristic parse (with MD description)
  // rather than blocking the user. Dev/self-hosted deployments without
  // an OpenRouter key still get the same UX as before.
  if (!input.llm) {
    return {
      ok: true,
      confidence: 0.5,
      parsed: splitDescriptionSections({
        ...heuristic,
        description: markdown || heuristic.description,
      }),
    };
  }

  if (!markdown || markdown.length < 200) {
    return {
      ok: false,
      confidence: 0,
      reason:
        "We couldn't read enough of this page to tell whether it's a job. Open the actual job posting (not a search result or job board) and try again.",
    };
  }

  let classification: JobClassification;
  try {
    classification = await classifyWithLLM(input.llm, {
      url: input.url ?? "",
      markdown,
      hint: heuristic,
    }, "job_extract");
  } catch (err) {
    logger.warn("[jobs/extract] LLM classification failed, falling open", err);
    // Don't punish the user for an upstream LLM outage — fall through
    // to the heuristic parse (with the structured MD description).
    return {
      ok: true,
      confidence: 0.5,
      parsed: splitDescriptionSections({
        ...heuristic,
        description: markdown || heuristic.description,
      }),
    };
  }

  if (!classification.isJobPosting || classification.confidence < CLASSIFICATION_THRESHOLD) {
    return {
      ok: false,
      confidence: classification.confidence,
      reason:
        classification.reason ||
        "This page doesn't look like a single job posting. Open the specific role you want to track (not a search result, company page, or job board) and try again.",
    };
  }

  // AI says yes — merge AI fields over the heuristic so the best
  // available value wins for each slot.
  const aiJob = classification.job ?? {};
  const aiCity = aiJob.city || undefined;
  const aiState = aiJob.state || undefined;
  const aiCountry = aiJob.country || undefined;
  const composedLocation =
    aiJob.location ||
    [aiCity, aiState, aiCountry].filter(Boolean).join(", ") ||
    heuristic.location;

  return {
    ok: true,
    confidence: classification.confidence,
    parsed: splitDescriptionSections({
      title: (aiJob.title || heuristic.title || "Tracked Job").slice(0, 250),
      description: aiJob.description || heuristic.description,
      company: aiJob.company || heuristic.company || HIRED_VIDEO_SEED_COMPANY,
      location: composedLocation,
      city: aiCity || heuristic.city,
      state: aiState || heuristic.state,
      country: aiCountry || heuristic.country,
      isRemote: aiJob.isRemote ?? heuristic.isRemote,
      jobType: aiJob.jobType || heuristic.jobType,
      experienceLevel: aiJob.experienceLevel || heuristic.experienceLevel,
      salaryMin: aiJob.salaryMin ?? heuristic.salaryMin,
      salaryMax: aiJob.salaryMax ?? heuristic.salaryMax,
      salaryCurrency: aiJob.salaryCurrency || heuristic.salaryCurrency,
      skills: aiJob.skills?.length ? aiJob.skills : heuristic.skills,
      responsibilities: aiJob.responsibilities?.length
        ? aiJob.responsibilities
        : heuristic.responsibilities,
      requirements: aiJob.requirements?.length ? aiJob.requirements : heuristic.requirements,
      qualifications: aiJob.qualifications?.length
        ? aiJob.qualifications
        : heuristic.qualifications,
      benefits: aiJob.benefits?.length ? aiJob.benefits : heuristic.benefits,
      applyUrl: aiJob.applyUrl || heuristic.applyUrl,
      confidence: "high",
    }),
  };
}
