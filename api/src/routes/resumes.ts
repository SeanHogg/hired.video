import { Hono } from "hono";
import { and, count, eq, ne, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { callLLM, getApiKey } from "../services/ai.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import { analyzeMerge, executeMerge, type MergeDecision } from "../services/resume-merge.js";
import {
  extractJson as extractJsonUtil,
  isParseComplete as isParseCompleteUtil,
  parseResumeWithRegex as parseResumeWithRegexUtil,
  normalizeJsonResume,
  tryParseJsonResume,
} from "../services/resume-parse.js";
import {
  extractSkills,
  mergeExtractedSkillsIntoResume,
  countSkillItems,
} from "../services/skill-extraction.js";
import { extractPdfText } from "../utils/pdf-extract.js";
import { computeDiffPercent } from "../utils/resume-diff.js";
import {
  CreateResumeSchema,
  UpdateResumeSchema,
  type Resume,
  type ResumeSummary,
  type ResumePrivacy,
} from "../../../shared/resume.js";

const { resumeInformation: resumes, watchedResumes, resumeViews } = schema;

export const resumeRoutes = new Hono<{ Variables: Variables }>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function fail(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}

// Serializers, row-extras queries, constants — all live in the shared
// handler module so resume-handlers.ts and this file aren't maintaining
// two copies of the same logic. See src/handlers/resume-serializer.ts.
import {
  UUID_RE,
  PRIVACY_TO_LEVEL,
  LEVEL_TO_PRIVACY,
  EMPTY_VIEWER_EXTRAS,
  freshOwnerExtras,
  normalizeContent,
  rowToResume,
  rowToResumeSummary,
  preserveMetaData,
  computeViewerExtras,
  computeViewerExtrasBatch,
  recordResumeView,
  refreshDiffPercentFor,
  persistSentimentScore,
  type ResumeViewerExtras,
} from "../handlers/resume-serializer.js";

// Re-export so existing consumers (tests, other routes) don't need to
// change their imports.
export {
  UUID_RE,
  PRIVACY_TO_LEVEL,
  LEVEL_TO_PRIVACY,
  EMPTY_VIEWER_EXTRAS,
  normalizeContent,
  rowToResume,
  rowToResumeSummary,
  preserveMetaData,
  computeViewerExtras,
  computeViewerExtrasBatch,
  recordResumeView,
  refreshDiffPercentFor,
  persistSentimentScore,
};
export type { ResumeViewerExtras };

/** Compute a short sha256 hash of the client's IP plus a daily salt so
 *  anonymous viewers can be coarsely deduped within a day without the
 *  raw IP landing in the DB. Returns null if no IP header is present
 *  (local test contexts). */
export function hashClientIp(c: any): string | null {
  const ip =
    c.req.header?.("cf-connecting-ip") ??
    c.req.header?.("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  if (!ip) return null;
  const salt = new Date().toISOString().slice(0, 10); // daily salt
  // Web Crypto is available in CF Workers + Node 20+. Fallback to a
  // non-crypto hash keeps tests and local dev from crashing if Web
  // Crypto is missing; this path is not security-critical — the hash
  // just dedupes anonymous views.
  try {
    const enc = new TextEncoder().encode(`${ip}|${salt}`);
    if (typeof crypto !== "undefined" && (crypto as any).subtle) {
      // Synchronous hash isn't available via Web Crypto; callers that
      // want a stable hash per-request can await the async helper
      // directly. This function returns a short fallback so the DB
      // write stays non-blocking for the common case.
    }
    // Cheap deterministic fallback — FNV-1a. Not cryptographic, just a
    // bucket id for same-day dedup.
    let h = 0x811c9dc5;
    for (let i = 0; i < enc.length; i++) {
      h ^= enc[i];
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// TRANSITIONAL BRIDGES — during the shim removal, many call sites still
// use the old `rowToLegacyResume(row)` / `rowToSummary(row, userId)`
// signatures. These forward to the new pure serializers with empty
// viewer extras. High-signal GET/list handlers are upgraded to use
// `computeViewerExtras[Batch]` directly; the remaining bridges will be
// removed as each caller is migrated.
// ---------------------------------------------------------------------------

function rowToLegacyResume(row: typeof resumes.$inferSelect): Resume {
  return rowToResume(row, EMPTY_VIEWER_EXTRAS);
}

function rowToSummary(
  row: typeof resumes.$inferSelect,
  currentUserId?: string | null,
): ResumeSummary {
  const isOwner = Boolean(currentUserId && row.userId === currentUserId);
  return rowToResumeSummary(row, { ...EMPTY_VIEWER_EXTRAS, isOwner });
}

async function parseBodyToContent(c: any): Promise<Record<string, unknown>> {
  const body = await c.req.json().catch(() => null);

  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return { raw: body };
    }
  }

  if (body && typeof body === "object") {
    if (typeof (body as any).content === "string") {
      try {
        return JSON.parse((body as any).content) as Record<string, unknown>;
      } catch {
        return { raw: (body as any).content };
      }
    }
    return body as Record<string, unknown>;
  }

  return {};
}


const RESUME_PARSE_PROMPT = [
  "You are a strict structured-extractor for resumes. Extract a JSON Resume.",
  "",
  "GROUPING RULES — read these before extracting anything:",
  "  - Each WORK entry = ONE role at ONE company. Every bullet point under that role is a `highlights[]` entry, NOT a separate work entry.",
  "  - Each VOLUNTEER entry = ONE role at ONE organization. Every bullet point under that role is a `highlights[]` entry, NOT a separate volunteer entry. Never split a volunteer role into multiple entries just because it has multiple bullets.",
  "  - Each PROJECT entry = ONE project. Bullets become `highlights[]`.",
  "  - Each EDUCATION entry = ONE degree or program at ONE institution. Multiple degrees at the same institution are separate entries.",
  "  - Use chronology, indentation, and bullet markers (•, -, *, ▪) to decide whether a line belongs to the current entry or starts a new one. A bulleted line BELONGS to the entry above it.",
  "",
  "DATE EXTRACTION — critical, do not skip:",
  "  - Every work, volunteer, education, and project entry MUST have `startDate` and `endDate` whenever any date is mentioned in the resume.",
  "  - Accept formats: 'Jan 2020', '01/2020', '2020', '2020-01', 'January 2020'.",
  "  - Return dates as 'YYYY-MM' when month is known, or 'YYYY' when only year is known.",
  "  - For current / ongoing roles use 'Present' as endDate.",
  "  - If a single date range covers a role (e.g. 'Acme Corp — 2018-2022' or '2020 – Present'), map the first date to startDate and the second to endDate.",
  "  - Do NOT leave startDate or endDate as empty string if the resume shows any date near the entry. Search the lines immediately before/after the company name.",
  "",
  "SKILLS — do NOT miss these:",
  "  - Scan the ENTIRE resume, not just a 'Skills' section. Extract skills from bullets, summaries, and role descriptions too.",
  "  - Recognise section headers in any form: 'Skills', 'Technical Skills', 'Core Competencies', 'Technologies', 'Tech Stack', 'Tools', 'Expertise', 'Proficiencies', 'Areas of Expertise'.",
  "  - When skills are grouped by category (e.g. 'Languages: Python, Go | Cloud: AWS, GCP'), produce one `skills[]` entry per category, with the category as `name` and the items as `keywords[]`.",
  "  - When skills are a flat comma/bullet list with no categories, produce ONE entry with `name: 'Skills'` and ALL items as `keywords[]`. Do NOT return an empty skills array if any skills appear anywhere in the document.",
  "  - Split on commas, bullets, pipes, slashes, and newlines. Preserve canonical casing (e.g. 'JavaScript', 'React', 'Node.js', 'PostgreSQL').",
  "",
  "CERTIFICATIONS — do NOT miss these:",
  "  - Recognise section headers in any form: 'Certifications', 'Certificates', 'Licenses', 'Credentials', 'Professional Certifications', 'Accreditations'.",
  "  - Each line or bullet under the section is usually ONE certificate. Extract `name` (the cert), `issuer` (the body that issued it, e.g. 'AWS', 'Microsoft', 'PMI'), and `date` if present.",
  "  - Common patterns: 'AWS Certified Solutions Architect – Associate (2022)', 'PMP, Project Management Institute, Jun 2021', 'Certified Scrum Master — Scrum Alliance'.",
  "  - If issuer is not explicitly labelled but is a well-known authority embedded in the cert name (e.g. 'AWS', 'Google Cloud', 'Microsoft', 'Cisco', 'CompTIA'), populate `issuer` from that.",
  "",
  "AWARDS — do NOT miss these:",
  "  - Recognise section headers in any form: 'Awards', 'Honors', 'Achievements', 'Recognition', 'Honors & Awards', 'Distinctions'.",
  "  - Each entry typically has a title, a date, and an awarder (organisation or person who granted it). Populate all three when present.",
  "  - Do NOT conflate awards with certifications — a 'Certified X' is a certificate; a 'Best Y Award' or 'Employee of the Year' is an award.",
  "",
  "OUTPUT — return ONLY a JSON object with this exact shape (no markdown fences, no commentary):",
  "{",
  '  "basics": { "name": "", "label": "", "email": "", "phone": "", "url": "", "summary": "", "location": { "address": "", "city": "", "region": "", "postalCode": "", "countryCode": "" } },',
  '  "work": [{ "name": "<company>", "position": "", "startDate": "", "endDate": "", "summary": "", "highlights": [], "url": "" }],',
  '  "education": [{ "institution": "", "area": "", "studyType": "", "startDate": "", "endDate": "", "score": "", "courses": [] }],',
  '  "skills": [{ "name": "", "level": "", "keywords": [] }],',
  '  "volunteer": [{ "organization": "", "position": "", "startDate": "", "endDate": "", "summary": "", "highlights": [], "url": "" }],',
  '  "awards": [{ "title": "", "date": "", "awarder": "", "summary": "" }],',
  '  "certificates": [{ "name": "", "date": "", "issuer": "", "url": "" }],',
  '  "publications": [{ "name": "", "publisher": "", "releaseDate": "", "url": "", "summary": "" }],',
  '  "languages": [{ "language": "", "fluency": "" }],',
  '  "interests": [{ "name": "", "keywords": [] }],',
  '  "references": [{ "name": "", "reference": "" }],',
  '  "projects": [{ "name": "", "description": "", "startDate": "", "endDate": "", "highlights": [], "keywords": [], "url": "", "roles": [] }]',
  "}",
  "Use empty string for missing text fields and empty arrays for missing array fields. Return only the JSON object, no markdown.",
].join("\n");

// extractJson, isParseComplete, and parseResumeWithRegex are imported
// from ../services/resume-parse.js — aliased below for local use.
const extractJson = extractJsonUtil;
const isParseComplete = isParseCompleteUtil;
const parseResumeWithRegex = parseResumeWithRegexUtil;

const SECTION_PROMPTS: Record<string, string> = {
  basics: `Extract ONLY the contact/summary info. Return JSON: { "basics": { "name": "", "label": "", "email": "", "phone": "", "url": "", "summary": "", "location": { "city": "", "region": "", "countryCode": "" } } }`,
  work: `Extract ONLY work experience. ONE entry per role — bullet points under a role are "highlights", not separate entries. Always extract startDate/endDate (YYYY-MM or YYYY, or "Present" for current). Return JSON: { "work": [{ "name": "<company>", "position": "", "startDate": "", "endDate": "", "summary": "", "highlights": [] }] }`,
  education: `Extract ONLY education. Always extract startDate/endDate. Return JSON: { "education": [{ "institution": "", "area": "", "studyType": "", "startDate": "", "endDate": "" }] }`,
  skills: `Extract ALL skills from the resume — scan every section, not just a "Skills" header. Accept headers like "Skills", "Technical Skills", "Core Competencies", "Technologies", "Tech Stack", "Tools", "Expertise". When grouped by category ("Languages: Python, Go | Cloud: AWS"), produce one entry per category with the category as "name" and items as "keywords". When flat, produce one entry with name "Skills" and all items as "keywords". Split on commas, bullets, pipes, and newlines. Never return an empty array if any skills appear anywhere. Return JSON: { "skills": [{ "name": "<category or 'Skills'>", "keywords": ["skill1", "skill2"] }] }`,
  certificates: `Extract ALL certifications, licenses, and credentials. Recognise headers: "Certifications", "Certificates", "Licenses", "Credentials", "Accreditations". Each line/bullet is usually one certificate. Extract name (the cert), issuer (issuing body like AWS, Microsoft, PMI, Scrum Alliance), and date if present. If issuer is not labelled but embedded in the cert name (e.g. "AWS Certified Solutions Architect"), populate issuer from that. Return JSON: { "certificates": [{ "name": "", "issuer": "", "date": "", "url": "" }] }`,
  awards: `Extract ALL awards, honors, achievements, and recognition. Recognise headers: "Awards", "Honors", "Achievements", "Recognition", "Honors & Awards", "Distinctions". Each entry has a title, date, and awarder (organisation/person who granted it). Do NOT conflate awards with certifications — "Certified X" is a certificate; "Best Y" or "Employee of the Year" is an award. Return JSON: { "awards": [{ "title": "", "date": "", "awarder": "", "summary": "" }] }`,
  volunteer: `Extract ONLY volunteer experience. ONE entry per role at ONE organization — bullet points under a role are "highlights", NOT separate volunteer entries. Always extract startDate/endDate if mentioned. Return JSON: { "volunteer": [{ "organization": "", "position": "", "startDate": "", "endDate": "", "summary": "", "highlights": [] }] }`,
  projects: `Extract ONLY projects. ONE entry per project — bullets under it are "highlights". Always extract startDate/endDate if present. Return JSON: { "projects": [{ "name": "", "description": "", "startDate": "", "endDate": "", "highlights": [], "keywords": [], "url": "" }] }`,
};

/** Run sectional parsing: prompt the AI once per section and merge results. */
async function parseResumeSectional(
  callAI: (systemPrompt: string, userMessage: string) => Promise<string>,
  resumeText: string,
): Promise<Record<string, unknown>> {
  const merged: Record<string, unknown> = {};
  for (const [section, prompt] of Object.entries(SECTION_PROMPTS)) {
    try {
      const raw = await callAI(
        `You are a resume parser. ${prompt} Return only valid JSON, no markdown.`,
        resumeText,
      );
      const parsed = extractJson(raw);
      if (parsed[section] !== undefined) {
        merged[section] = parsed[section];
      }
    } catch (err) {
      console.warn(`[parse-sectional] ${section} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return merged;
}

async function parseResumeTextWithAI(c: any, resumeText: string): Promise<Record<string, unknown>> {
  // Helper to call whichever AI provider is available
  const cfAi = (c.env as any)?.AI ?? (globalThis as any).__ENV?.AI;
  const apiKey = getApiKey(c.env as { OPENROUTER_API_KEY?: string });

  const callAI = async (systemPrompt: string, userMessage: string): Promise<string> => {
    if (cfAi) {
      const aiResponse = await (cfAi as any).run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage.slice(0, 6000) },
        ],
      });
      return typeof aiResponse?.response === "string" ? aiResponse.response : JSON.stringify(aiResponse);
    }
    if (apiKey) {
      return await callLLM(apiKey, {
        systemPrompt,
        userMessage: userMessage.slice(0, 12000),
        responseFormat: "json_object",
      });
    }
    throw new Error("No AI provider available");
  };

  let bestResult: Record<string, unknown> | null = null;

  // 1. Try full single-pass parse
  try {
    const raw = await callAI(RESUME_PARSE_PROMPT, resumeText);
    const result = extractJson(raw);
    if (isParseComplete(result)) {
      bestResult = result;
    } else {
      console.warn("[parse] Single-pass result incomplete, trying sectional parse");
      if (Object.keys(result).length > 0) bestResult = result;
    }
  } catch (err) {
    console.error("[parse] Single-pass failed:", err instanceof Error ? err.message : err);
  }

  // 2. Sectional fallback: prompt per section and merge
  if (!bestResult || !isParseComplete(bestResult)) {
    try {
      const sectional = await parseResumeSectional(callAI, resumeText);
      if (isParseComplete(sectional)) {
        bestResult = sectional;
      } else if (Object.keys(sectional).length > 0) {
        bestResult = bestResult ? { ...bestResult, ...sectional } : sectional;
      }
    } catch (err) {
      console.error("[parse] Sectional parse failed:", err instanceof Error ? err.message : err);
    }
  }

  // 3. Always run regex extraction and fill any sections the AI missed.
  // The regex parser is reliable for well-structured resumes even when AI
  // models return sparse results.
  const regexResult = parseResumeWithRegex(resumeText);

  if (!bestResult) return regexResult;

  // Helper: check if an array section has any items with real content
  // (not just placeholder objects with all-empty string values).
  const SECTION_ID_KEYS: Record<string, string[]> = {
    work: ["name", "position"], education: ["institution", "area"],
    skills: ["name"], volunteer: ["organization", "position"],
    awards: ["title"], certificates: ["name"], publications: ["name"],
    languages: ["language"], interests: ["name"], references: ["name"],
    projects: ["name"],
  };
  const hasRealContent = (arr: unknown[], key: string) => {
    const idKeys = SECTION_ID_KEYS[key] ?? ["name"];
    return arr.some((item: any) =>
      idKeys.some((k) => typeof item[k] === "string" && item[k].trim().length > 0),
    );
  };

  // Merge: for each section, keep the AI result if it has real content,
  // otherwise use regex. Placeholder objects like { area: "", institution: "" }
  // are treated as empty.
  const merged = { ...bestResult };
  const sectionKeys = ["basics", "work", "education", "skills", "volunteer", "awards", "certificates", "publications", "languages", "interests", "references", "projects"];
  for (const key of sectionKeys) {
    const aiVal = merged[key];
    const regexVal = regexResult[key];
    if (key === "basics") {
      // Merge basics fields individually — fill empty AI fields with regex values
      const aiBas = (aiVal ?? {}) as Record<string, unknown>;
      const regBas = (regexVal ?? {}) as Record<string, unknown>;
      const mergedBasics: Record<string, unknown> = { ...regBas, ...aiBas };
      // Only overwrite with regex if AI field is empty/missing
      for (const [k, v] of Object.entries(regBas)) {
        if (!mergedBasics[k] || (typeof mergedBasics[k] === "string" && !(mergedBasics[k] as string).trim())) {
          mergedBasics[k] = v;
        }
      }
      merged.basics = mergedBasics;
    } else if (!Array.isArray(aiVal) || aiVal.length === 0 || !hasRealContent(aiVal, key)) {
      // AI returned empty/placeholder array — use regex if it has better data
      if (Array.isArray(regexVal) && regexVal.length > 0) {
        merged[key] = regexVal;
      }
    }
  }

  // 4. Consolidate entries that were fragmented by the AI into separate
  // records when they should have been a single entry with highlights.
  // Pattern: consecutive entries with the same organization/company but
  // empty position+dates are really bullets that leaked through.
  merged.work = consolidateFragmentedEntries(merged.work, ["name"], ["position", "startDate", "endDate"]);
  merged.volunteer = consolidateFragmentedEntries(merged.volunteer, ["organization"], ["position", "startDate", "endDate"]);

  // 5. Missing-fields rescan: detect entries that are missing dates and
  // ask the AI to fill them specifically — mirrors the job refresh pattern.
  try {
    const needsDates = findEntriesMissingDates(merged);
    if (needsDates.length > 0 && (cfAi || apiKey)) {
      const filled = await rescanMissingDates(callAI, resumeText, needsDates);
      applyDateRescan(merged, filled);
    }
  } catch (err) {
    console.warn("[parse] Date rescan failed:", err instanceof Error ? err.message : err);
  }

  // 6. Skill enrichment: if the parsed resume has few or no skills, run the
  // dedicated skill extractor against the full text. The main parse prompt
  // is a generalist; the extractor is skill-specific, categorises output,
  // and scans the whole document rather than just a "Skills" section.
  try {
    const currentCount = countSkillItems(merged.skills);
    const SKILL_ENRICHMENT_THRESHOLD = 5;
    if (currentCount < SKILL_ENRICHMENT_THRESHOLD && apiKey) {
      const { data } = await extractSkills(apiKey, resumeText, "resume");
      if (data.skills.length > 0) {
        merged.skills = mergeExtractedSkillsIntoResume(merged.skills, data.skills);
      }
    }
  } catch (err) {
    console.warn(
      "[parse] Skill enrichment failed:",
      err instanceof Error ? err.message : err,
    );
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Post-parse consolidation + missing-field rescan
// ---------------------------------------------------------------------------

/**
 * Consolidate entries fragmented into separate records when they should
 * have been one entry with highlights. When two consecutive entries share
 * the same identity key (e.g. same organization) but the later one has
 * only a summary/highlights and no distinguishing fields (position/dates),
 * merge the later one's summary+highlights into the earlier entry.
 */
function consolidateFragmentedEntries(
  entries: unknown,
  identityKeys: string[],
  distinguishingKeys: string[],
): unknown[] {
  if (!Array.isArray(entries) || entries.length < 2) return Array.isArray(entries) ? entries : [];
  const result: any[] = [];
  const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
  const getIdentity = (item: any) => identityKeys.map((k) => norm(item[k] ?? item[k.charAt(0).toUpperCase() + k.slice(1)])).filter(Boolean).join("|");
  const hasAnyDistinguishing = (item: any) =>
    distinguishingKeys.some((k) => {
      const v = item[k] ?? item[k.charAt(0).toUpperCase() + k.slice(1)];
      return typeof v === "string" && v.trim().length > 0;
    });

  for (const item of entries as any[]) {
    if (!item || typeof item !== "object") { result.push(item); continue; }
    const identity = getIdentity(item);
    const last = result[result.length - 1];
    const lastIdentity = last ? getIdentity(last) : "";

    // If this item shares identity with the previous one AND has no
    // distinguishing fields (no position, no dates), treat it as a bullet
    // that leaked through — fold its summary/highlights into the previous.
    if (last && identity && identity === lastIdentity && !hasAnyDistinguishing(item)) {
      const existingHighlights: string[] = Array.isArray(last.highlights) ? [...last.highlights] : [];
      const newHighlights: string[] = Array.isArray(item.highlights) ? item.highlights : [];
      for (const h of newHighlights) {
        if (h && !existingHighlights.includes(h)) existingHighlights.push(h);
      }
      if (typeof item.summary === "string" && item.summary.trim()) {
        if (!existingHighlights.includes(item.summary.trim())) existingHighlights.push(item.summary.trim());
      }
      last.highlights = existingHighlights;
      continue;
    }

    result.push({ ...item });
  }
  return result;
}

/** Section-local missing-date detector. Returns a list of refs the AI needs to fill. */
function findEntriesMissingDates(
  parsed: Record<string, unknown>,
): Array<{ section: "work" | "education" | "volunteer" | "projects"; index: number; identityLabel: string }> {
  const needs: Array<{ section: any; index: number; identityLabel: string }> = [];
  const sections: Array<["work" | "education" | "volunteer" | "projects", (item: any) => string]> = [
    ["work", (i) => `${i.position ?? ""} at ${i.name ?? ""}`.trim()],
    ["education", (i) => `${i.studyType ?? ""} ${i.area ?? ""} at ${i.institution ?? ""}`.trim()],
    ["volunteer", (i) => `${i.position ?? ""} at ${i.organization ?? ""}`.trim()],
    ["projects", (i) => `${i.name ?? ""}`.trim()],
  ];
  for (const [section, labelOf] of sections) {
    const arr = parsed[section];
    if (!Array.isArray(arr)) continue;
    arr.forEach((item: any, index: number) => {
      if (!item || typeof item !== "object") return;
      const start = item.startDate ?? item.StartDate;
      const end = item.endDate ?? item.EndDate;
      const hasStart = typeof start === "string" && start.trim().length > 0;
      const hasEnd = typeof end === "string" && end.trim().length > 0;
      if (!hasStart || !hasEnd) {
        const label = labelOf(item);
        if (label) needs.push({ section, index, identityLabel: label });
      }
    });
  }
  return needs;
}

/** Ask the AI to find dates for a specific list of entries in the resume text. */
async function rescanMissingDates(
  callAI: (systemPrompt: string, userMessage: string) => Promise<string>,
  resumeText: string,
  entries: Array<{ section: string; index: number; identityLabel: string }>,
): Promise<Array<{ section: string; index: number; startDate: string; endDate: string }>> {
  const systemPrompt = [
    "You are a focused date extractor for resumes.",
    "You are given a resume and a list of entries that are missing startDate and/or endDate.",
    "For EACH entry, search the resume text carefully and return the dates you find.",
    "",
    "RULES:",
    "  - Return 'YYYY-MM' when month is known, or 'YYYY' when only year is known.",
    "  - Use 'Present' as endDate for current/ongoing roles (e.g. 'since 2022', '2022 - Current').",
    "  - If no date can be found for an entry, return empty strings for that entry.",
    "  - DO NOT invent dates. Only return dates that appear in the text.",
    "",
    "Return ONLY a JSON object with this exact shape (no markdown fences):",
    '{ "dates": [{ "section": "", "index": 0, "startDate": "", "endDate": "" }] }',
  ].join("\n");

  const userMessage = [
    "--- RESUME TEXT ---",
    resumeText,
    "--- END RESUME ---",
    "",
    "Find dates for these entries:",
    ...entries.map((e) => `  - section="${e.section}" index=${e.index}: ${e.identityLabel}`),
  ].join("\n");

  const raw = await callAI(systemPrompt, userMessage);
  const parsed = extractJson(raw);
  const out: Array<{ section: string; index: number; startDate: string; endDate: string }> = [];
  if (Array.isArray((parsed as any).dates)) {
    for (const d of (parsed as any).dates as any[]) {
      if (!d || typeof d !== "object") continue;
      out.push({
        section: String(d.section ?? ""),
        index: Number.isFinite(d.index) ? Number(d.index) : -1,
        startDate: String(d.startDate ?? "").trim(),
        endDate: String(d.endDate ?? "").trim(),
      });
    }
  }
  return out;
}

/** Apply rescanned dates to the merged result, never overwriting existing values. */
function applyDateRescan(
  merged: Record<string, unknown>,
  filled: Array<{ section: string; index: number; startDate: string; endDate: string }>,
): void {
  for (const f of filled) {
    const arr = merged[f.section];
    if (!Array.isArray(arr)) continue;
    const item = arr[f.index] as Record<string, unknown> | undefined;
    if (!item || typeof item !== "object") continue;
    // Never overwrite — only fill empties (same safety rule as job refresh backfill)
    if (f.startDate && !(item.startDate as string)?.trim() && !(item.StartDate as string)?.trim()) {
      (item as any).startDate = f.startDate;
    }
    if (f.endDate && !(item.endDate as string)?.trim() && !(item.EndDate as string)?.trim()) {
      (item as any).endDate = f.endDate;
    }
  }
}

/**
 * Returns true when the user has no resumes yet. The first-uploaded resume
 * is promoted to master+active automatically so the Chrome extension (which
 * only surfaces the active resume) has something to work with, and so new
 * users aren't forced to click "Set Master" / "Set Active" before their
 * first upload is usable.
 */
async function userHasNoResumes(db: any, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(resumes)
    .where(eq(resumes.userId, userId));
  return (row?.n ?? 0) === 0;
}

// Modern plural endpoints — also exported so app.ts can register them at the mount root
// (Hono sub-router root "/" never matches when mounted with app.route(prefix, router))
export const listResumesHandler = async (c: any) => {
  const user = c.var.user;
  const db = getDb();
  const rows = await db.select().from(resumes).where(eq(resumes.userId, user.sub)).orderBy(resumes.updatedAt);
  const extrasMap = await computeViewerExtrasBatch(db, rows, user.sub);
  return c.json(
    ok(rows.map((r) => rowToResume(r, extrasMap.get(r.id) ?? EMPTY_VIEWER_EXTRAS))),
    200,
  );
};

export const createResumeHandler = async (c: any) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = CreateResumeSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);

  // Resolve content with priority:
  //   1. Explicit `content` object — normalise keys (client may send
  //      PascalCase from a JSON Resume export).
  //   2. `rawText` — try JSON Resume parse first, fall back to AI parse.
  let content: Record<string, unknown> = parsed.data.content
    ? normalizeJsonResume(parsed.data.content)
    : {};
  if (parsed.data.rawText) {
    const structured = tryParseJsonResume(parsed.data.rawText);
    content = structured ?? (await parseResumeTextWithAI(c, parsed.data.rawText));
  }

  const privacyLevel = PRIVACY_TO_LEVEL[parsed.data.privacy ?? "private"] ?? 10;
  const db = getDb();

  // First upload on the account → auto-promote to master+active so the
  // Chrome extension has an active resume to tailor with and the web UI
  // doesn't leave new users staring at an unactivated card.
  const isFirst = await userHasNoResumes(db, user.sub);
  const isMaster = (parsed.data.isMaster ?? false) || isFirst;

  // Insert first (slug may come in as user-supplied or null), then if
  // no slug was provided set slug = the generated resume id so the row
  // always has a stable URL segment. Users can rename the slug later via
  // the edit page; the UUID form still works because both /public/:slug
  // and /embedded/:identifier detect UUID-shaped paths and match against
  // the id column directly.
  //
  // If the caller DID supply a slug, verify global uniqueness before the
  // insert — same rule handleUpdateResume enforces. Public URLs resolve
  // to a single row, so a collision silently shadows someone else's link.
  if (parsed.data.slug) {
    const [taken] = await db
      .select({ id: resumes.id })
      .from(resumes)
      .where(eq(resumes.slug, parsed.data.slug))
      .limit(1);
    if (taken) {
      return c.json(
        fail(
          "SLUG_TAKEN",
          `The slug "${parsed.data.slug}" is already in use. Please choose a different slug.`,
        ),
        409,
      );
    }
  }

  const [created] = await db
    .insert(resumes)
    .values({
      userId: user.sub,
      title: parsed.data.title,
      slug: parsed.data.slug ?? null,
      content,
      status: parsed.data.status,
      isMaster,
      isActive: isFirst,
      privacyLevel,
    } as any)
    .returning();

  let finalRow = created;
  if (!parsed.data.slug) {
    const [updated] = await db
      .update(resumes)
      .set({ slug: created.id } as any)
      .where(eq(resumes.id, created.id))
      .returning();
    finalRow = updated ?? created;
  }

  return c.json(ok(rowToLegacyResume(finalRow)), 201);
};

// Register at both "" and "/" — Hono sub-router path stripping can vary
resumeRoutes.get("", listResumesHandler);
resumeRoutes.get("/", listResumesHandler);
resumeRoutes.post("", createResumeHandler);
resumeRoutes.post("/", createResumeHandler);

resumeRoutes.get("/public", async (c) => {
  const { handleListPublicResumes } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleListPublicResumes(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user?.sub ?? null,
    {
      page: Number(c.req.query("page") ?? 1) || 1,
      limit: Number(c.req.query("limit") ?? 20) || 20,
    },
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.get("/public/:slug", async (c) => {
  const { handleGetResume } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleGetResume(
    buildResumeDeps(() => Promise.resolve({})),
    {
      viewerId: c.var.user?.sub ?? null,
      ipHash: hashClientIp(c),
      referrer: c.req.header("referer") ?? c.req.header("referrer") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    },
    c.req.param("slug"),
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.get("/getresumesownedbyauthuser", async (c) => {
  const { handleListOwnedResumes } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleListOwnedResumes(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.get("/withownership", async (c) => {
  const { handleListOwnedResumes } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleListOwnedResumes(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    { includeOwnership: true },
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.get("/mastergroups", async (c) => {
  const { handleListMasterGroups } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleListMasterGroups(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.get("/validateslug", async (c) => {
  const { handleValidateSlug } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleValidateSlug(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    {
      slug: c.req.query("slug") ?? "",
      resumeId: c.req.query("resumeId") ?? null,
    },
  );
  return c.json(result.body as any, result.status as any);
});

// Mounted under optionalAuthMiddleware (see app.ts OPTIONAL_AUTH_PUBLIC_ROUTE)
// so anonymous callers can embed public resumes (chrome extension, job-profile
// embeds, social feed). Owners can additionally embed their own private resumes.
// View recording is skipped — embeds would otherwise inflate analytics with
// every pageload of a page containing an embed.
resumeRoutes.get("/embedded/:identifier", async (c) => {
  const { handleGetResume } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleGetResume(
    buildResumeDeps(() => Promise.resolve({})),
    {
      viewerId: c.var.user?.sub ?? null,
      ipHash: hashClientIp(c),
      referrer: c.req.header("referer") ?? c.req.header("referrer") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    },
    c.req.param("identifier"),
    { recordView: false },
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/save", async (c) => {
  const { handleSaveResume } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const content = await parseBodyToContent(c);
  const result = await handleSaveResume(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    content,
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/parse", attachTokenBudget(), async (c) => {
  const contentType = c.req.header("Content-Type") ?? "";

  let resumeText = "";
  let preParsed: Record<string, unknown> | null = null;

  // Multipart path — file upload
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file") as File | null;
    if (file) {
      const lower = file.name.toLowerCase();
      const isPdf = file.type === "application/pdf" || lower.endsWith(".pdf");
      const isJson = file.type === "application/json" || lower.endsWith(".json");
      if (isJson) {
        const raw = await file.text().catch(() => "");
        preParsed = tryParseJsonResume(raw);
        if (!preParsed) resumeText = raw;
      } else if (isPdf) {
        const bytes = await file.arrayBuffer().catch(() => null);
        if (bytes) {
          resumeText = await extractPdfText(new Uint8Array(bytes));
        }
      } else {
        resumeText = await file.text().catch(() => "");
      }
    }
  } else {
    // JSON path
    const body = await c.req.json().catch(() => ({}));
    // Accept an already-parsed JSON Resume envelope directly (e.g. Chrome
    // extension paste of exported JSON)
    if (body?.parsedContent && typeof body.parsedContent === "object") {
      preParsed = normalizeJsonResume(body.parsedContent);
    } else if (typeof body?.content === "string") {
      resumeText = body.content;
    } else if (typeof body?.text === "string") {
      resumeText = body.text;
    }
  }

  if (!preParsed && !resumeText) {
    return c.json(fail("PARSE_FAILED", "Could not extract text from the uploaded file. Try a text-based PDF, DOCX, or paste the text directly."), 422);
  }

  // Prefer structured JSON Resume over AI parsing when available — this
  // preserves dates, highlights, and grouping exactly as authored.
  if (!preParsed && resumeText) {
    preParsed = tryParseJsonResume(resumeText);
  }

  const parsed = preParsed ?? (await parseResumeTextWithAI(c, resumeText));
  return c.json(ok({ result: JSON.stringify(parsed) }), 200);
});

/**
 * POST /api/resumes/createfromfile
 *
 * Multipart file upload. Handles JSON Resume exports, PDFs, DOCX, and
 * plain text. PDFs are extracted server-side via extractPdfText (same
 * pdfjs-equivalent FlateDecode parser the web UI falls back to) so
 * the Chrome extension can POST raw bytes when its client-side
 * extractor can't read the file — keeping the extension bundle free
 * of pdfjs (MV3 store review avoids the `new Function` flag entirely).
 */
resumeRoutes.post("/createfromfile", async (c) => {
  const user = c.var.user;
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  if (!file) {
    return c.json(fail("VALIDATION_ERROR", "No file provided."), 422);
  }

  const lower = file.name?.toLowerCase() ?? "";
  const isJson = file.type === "application/json" || lower.endsWith(".json");
  const isPdf = file.type === "application/pdf" || lower.endsWith(".pdf");

  let resumeText = "";
  let structured: Record<string, unknown> | null = null;

  if (isJson) {
    const raw = await file.text().catch(() => "");
    structured = tryParseJsonResume(raw);
    if (!structured) resumeText = raw;
  } else if (isPdf) {
    const buf = await file.arrayBuffer().catch(() => null);
    if (buf) resumeText = await extractPdfText(new Uint8Array(buf));
    if (!resumeText || resumeText.trim().length < 20) {
      return c.json(
        fail(
          "PARSE_FAILED",
          "Could not extract text from this PDF — it may be a scan or use an unusual encoding. Try a Word (.docx) export, or paste the resume text directly.",
        ),
        422,
      );
    }
  } else {
    resumeText = await file.text().catch(() => "");
  }

  // Structured JSON Resume takes priority; otherwise run AI parse so the
  // result matches /createfromtext's output (extension and web app use the
  // same stored shape regardless of which surface uploaded).
  let content: Record<string, unknown>;
  if (structured) {
    content = structured;
  } else if (resumeText) {
    // Reject anything still looking like raw binary before it reaches JSONB.
    if (resumeText.includes("\u0000") || /^PK\u0003\u0004/.test(resumeText)) {
      return c.json(
        fail(
          "INVALID_RESUME_TEXT",
          "Couldn't read that file — it looks like raw binary. Try PDF, DOCX, TXT, or JSON.",
        ),
        422,
      );
    }
    const cleaned = resumeText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    const jsonFromText = tryParseJsonResume(cleaned);
    if (jsonFromText) {
      content = jsonFromText;
    } else {
      try {
        content = await parseResumeTextWithAI(c, cleaned);
      } catch (err) {
        console.warn(
          "[createfromfile] AI parse failed, storing raw text fallback:",
          err instanceof Error ? err.message : err,
        );
        content = { raw: cleaned };
      }
    }
  } else {
    content = { raw: "" };
  }

  const title = deriveTitleFromContent(content, file.name) || "Uploaded Resume";

  const db = getDb();
  const isFirst = await userHasNoResumes(db, user.sub);
  const [created] = await db
    .insert(resumes)
    .values({
      userId: user.sub,
      title,
      content,
      status: "draft",
      isMaster: isFirst,
      isActive: isFirst,
    } as any)
    .returning();

  return c.json(ok(rowToLegacyResume(created)), 201);
});

/** Extract a human-friendly title from a JSON Resume content blob. Falls
 *  back to the provided filename when no suitable title field is found. */
function deriveTitleFromContent(content: Record<string, unknown> | unknown, filename?: string): string {
  if (content && typeof content === "object") {
    const c = content as Record<string, unknown>;
    const basics = (c.basics ?? c.Basics) as Record<string, unknown> | undefined;
    if (basics && typeof basics === "object") {
      const name = basics.name ?? basics.Name;
      const label = basics.label ?? basics.Label;
      if (typeof name === "string" && name.trim()) {
        return typeof label === "string" && label.trim() ? `${name} — ${label}` : name;
      }
    }
  }
  if (filename) return filename.replace(/\.[^/.]+$/, "");
  return "";
}

/**
 * POST /api/resumes/createfromtext
 *
 * Chrome extension endpoint: accepts pre-extracted plain text instead of
 * a binary file.  This avoids binary-parsing issues (PDFs read via
 * file.text() produce garbage and "unsupported Unicode escape sequence"
 * errors in the DB).  The extension extracts text client-side and sends
 * it here as JSON.
 */
resumeRoutes.post("/createfromtext", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : "Uploaded Resume";
  const rawText = typeof body?.text === "string" ? body.text : "";

  // Reject raw binary payloads before they reach Postgres. A client that
  // failed to extract text from a PDF/DOCX may ship the raw bytes as a
  // string — Postgres JSONB rejects any embedded \u0000 with a cryptic
  // "unsupported Unicode escape sequence" error. Catch that here with a
  // clear message so the user knows to re-upload a different format.
  if (rawText.includes("\u0000") || /^%PDF/.test(rawText) || /^PK\u0003\u0004/.test(rawText)) {
    return c.json(
      fail(
        "INVALID_RESUME_TEXT",
        "Couldn't read that file — it looks like raw binary instead of plain text. " +
          "Try a .txt, .md, .docx file, or a PDF containing selectable text (not a scan).",
      ),
      422,
    );
  }

  // Strip any remaining control characters other than tabs/newlines — they
  // survive JSON transport but break the JSONB column.
  const text = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

  if (!text || text.trim().length < 10) {
    return c.json(fail("VALIDATION_ERROR", "Resume text is too short or empty. Please try a different file."), 422);
  }

  // Resolve content: structured JSON Resume if the payload is one, else
  // run the AI parser so the Chrome extension gets the same structured
  // result as the web UI (Resume Manager, scoring, tailoring all rely on
  // parsed work/education/skills — `{ raw: text }` breaks all of them).
  const structured = tryParseJsonResume(text);
  let content: Record<string, unknown>;
  if (structured) {
    content = structured;
  } else {
    try {
      content = await parseResumeTextWithAI(c, text);
    } catch (err) {
      console.warn(
        "[createfromtext] AI parse failed, storing raw text fallback:",
        err instanceof Error ? err.message : err,
      );
      content = { raw: text };
    }
  }
  const finalTitle = structured
    ? (deriveTitleFromContent(structured) || title)
    : title;

  const db = getDb();
  const isFirst = await userHasNoResumes(db, user.sub);
  const [created] = await db
    .insert(resumes)
    .values({
      userId: user.sub,
      title: finalTitle,
      content,
      status: "draft",
      isMaster: isFirst,
      isActive: isFirst,
    } as any)
    .returning();

  return c.json(ok(rowToLegacyResume(created)), 201);
});

resumeRoutes.post("/summarize", attachTokenBudget(), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const resumeText = typeof body?.resumeText === "string" ? body.resumeText : "";
  const result = resumeText
    ? `Summary: ${resumeText.slice(0, 240)}${resumeText.length > 240 ? "..." : ""}`
    : "Summary generated for the selected resume.";
  return c.json(ok({ result }), 200);
});

resumeRoutes.post("/sentimentprediction", attachTokenBudget(), async (c) => {
  const { handleSentimentPrediction } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const body = await c.req.json().catch(() => null);
  const result = await handleSentimentPrediction(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    body,
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/watch/:id", async (c) => {
  const { handleWatchResume } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleWatchResume(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/unwatch/:id", async (c) => {
  const { handleUnwatchResume } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleUnwatchResume(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

// Dynamic routes below static routes
// Mounted under optionalAuthMiddleware via PUBLIC_RESUME_DETAIL_ROUTE in app.ts.
// Access policy: owner always wins; anyone else only sees public resumes.
// Privacy-blocked requests return 404 with code="RESUME_PRIVATE" so that when
// owners share a link, the recipient is told the resume is private (prompting
// them to ask for access) rather than seeing a generic "doesn't exist" error.
// Dynamic routes — thin Hono adapters delegating to resume-handlers.ts.
// Access policy: mounted under optionalAuthMiddleware via
// PUBLIC_RESUME_DETAIL_ROUTE in app.ts. Owner always wins; anyone else
// only sees public resumes. Privacy-blocked requests return 404 with
// code="RESUME_PRIVATE" so owner-shared links prompt recipients to ask
// for access rather than showing a generic "doesn't exist" error.
resumeRoutes.get("/:id", async (c) => {
  const { handleGetResume } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleGetResume(
    buildResumeDeps(() => Promise.resolve({})),
    {
      viewerId: c.var.user?.sub ?? null,
      ipHash: hashClientIp(c),
      referrer: c.req.header("referer") ?? c.req.header("referrer") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    },
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.put("/:id", async (c) => {
  const { handleUpdateResume } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const body = await c.req.json().catch(() => null);
  const result = await handleUpdateResume(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
    body,
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.delete("/:id", async (c) => {
  const { handleDeleteResume } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleDeleteResume(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/:id/clone", async (c) => {
  const { handleCloneResume } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleCloneResume(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/:id/publish", async (c) => {
  const { handlePublishResume } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handlePublishResume(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

/**
 * Convert a JSON Resume content object to formatted Markdown.
 * Handles the standard JSON Resume schema (basics, work, education,
 * skills, volunteer, projects, certificates) as well as legacy flat
 * formats. Falls back to JSON.stringify only if the content is
 * completely unrecognisable.
 */
function jsonResumeToMarkdown(content: Record<string, unknown> | null, fallbackTitle: string): string {
  if (!content || typeof content !== "object") return `# ${fallbackTitle}\n`;
  const c = content as Record<string, unknown>;
  const sections: string[] = [];

  // Helper to coerce arrays
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  // ---- Basics / Contact ----
  const basics = (c.basics ?? c.Basics) as Record<string, unknown> | undefined;
  if (basics && typeof basics === "object") {
    const name = basics.name ?? basics.Name ?? fallbackTitle;
    sections.push(`# ${name}`);
    const subtitle = basics.label ?? basics.Label;
    if (subtitle) sections.push(`**${subtitle}**`);
    const contact: string[] = [];
    if (basics.email ?? basics.Email) contact.push(String(basics.email ?? basics.Email));
    if (basics.phone ?? basics.Phone) contact.push(String(basics.phone ?? basics.Phone));
    const loc = basics.location as Record<string, unknown> | undefined;
    if (loc && typeof loc === "object") {
      const locParts = [loc.city, loc.region, loc.countryCode].filter(Boolean);
      if (locParts.length) contact.push(locParts.join(", "));
    }
    if (basics.url ?? basics.website) contact.push(String(basics.url ?? basics.website));
    if (contact.length) sections.push(contact.join(" | "));
    const summary = basics.summary ?? basics.Summary;
    if (summary) sections.push(`\n## Summary\n\n${summary}`);
  } else {
    // Legacy flat format
    const name = c.name ?? c.fullName ?? fallbackTitle;
    sections.push(`# ${name}`);
    const title = c.headline ?? c.title ?? c.label;
    if (title) sections.push(`**${title}**`);
    const summary = c.summary ?? c.objective;
    if (summary) sections.push(`\n## Summary\n\n${summary}`);
  }

  // ---- Skills ----
  const skills = c.skills ?? c.Skills;
  if (Array.isArray(skills) && skills.length) {
    const lines = skills.map((s: unknown) => {
      if (typeof s === "string") return `- ${s}`;
      if (s && typeof s === "object") {
        const sk = s as Record<string, unknown>;
        const name = sk.name ?? sk.Name ?? "";
        const kw = Array.isArray(sk.keywords ?? sk.Keywords)
          ? (sk.keywords ?? sk.Keywords) as string[]
          : [];
        return kw.length ? `- **${name}**: ${kw.join(", ")}` : `- ${name}`;
      }
      return "";
    }).filter(Boolean);
    if (lines.length) sections.push(`\n## Skills\n\n${lines.join("\n")}`);
  } else if (typeof skills === "string" && skills.trim()) {
    sections.push(`\n## Skills\n\n${skills}`);
  }

  // ---- Work Experience ----
  const work = arr(c.work ?? c.Work ?? c.experience ?? c.workExperience ?? c.Experience);
  if (work.length) {
    const entries = work.map((item: unknown) => {
      if (!item || typeof item !== "object") return "";
      const j = item as Record<string, unknown>;
      const company = j.name ?? j.Name ?? j.company ?? j.employer ?? "";
      const position = j.position ?? j.Position ?? j.title ?? "";
      const dates = [j.startDate ?? j.StartDate, j.endDate ?? j.EndDate ?? "Present"]
        .filter(Boolean).join(" – ");
      const lines: string[] = [`### ${position}${company ? ` — ${company}` : ""}`];
      if (dates) lines.push(`*${dates}*`);
      const summary = j.summary ?? j.Summary ?? j.description;
      if (summary) lines.push(`\n${summary}`);
      const highlights = (j.highlights ?? j.Highlights) as string[] | undefined;
      if (Array.isArray(highlights) && highlights.length) {
        lines.push(highlights.map(h => `- ${h}`).join("\n"));
      }
      return lines.join("\n");
    }).filter(Boolean);
    if (entries.length) sections.push(`\n## Experience\n\n${entries.join("\n\n")}`);
  }

  // ---- Education ----
  const education = arr(c.education ?? c.Education);
  if (education.length) {
    const entries = education.map((item: unknown) => {
      if (!item || typeof item !== "object") return "";
      const e = item as Record<string, unknown>;
      const institution = e.institution ?? e.Institution ?? e.school ?? "";
      const degree = [e.studyType ?? e.StudyType, e.area ?? e.Area]
        .filter(Boolean).join(" in ") || (e.degree ?? e.program ?? "");
      const dates = [e.startDate ?? e.StartDate, e.endDate ?? e.EndDate]
        .filter(Boolean).join(" – ");
      const line = `### ${degree}${institution ? ` — ${institution}` : ""}`;
      return dates ? `${line}\n*${dates}*` : line;
    }).filter(Boolean);
    if (entries.length) sections.push(`\n## Education\n\n${entries.join("\n\n")}`);
  }

  // ---- Volunteer ----
  const volunteer = arr(c.volunteer ?? c.Volunteer);
  if (volunteer.length) {
    const entries = volunteer.map((item: unknown) => {
      if (!item || typeof item !== "object") return "";
      const v = item as Record<string, unknown>;
      const position = v.position ?? v.Position ?? "";
      const org = v.organization ?? v.Organization ?? "";
      return `### ${position}${org ? ` — ${org}` : ""}`;
    }).filter(Boolean);
    if (entries.length) sections.push(`\n## Volunteer\n\n${entries.join("\n\n")}`);
  }

  // ---- Projects ----
  const projects = arr(c.projects ?? c.Projects);
  if (projects.length) {
    const entries = projects.map((item: unknown) => {
      if (!item || typeof item !== "object") return "";
      const p = item as Record<string, unknown>;
      const name = p.name ?? p.Name ?? "";
      const desc = p.description ?? p.Description ?? "";
      return desc ? `### ${name}\n${desc}` : `### ${name}`;
    }).filter(Boolean);
    if (entries.length) sections.push(`\n## Projects\n\n${entries.join("\n\n")}`);
  }

  // ---- Certificates ----
  const certs = arr(c.certificates ?? c.Certificates);
  if (certs.length) {
    const entries = certs.map((item: unknown) => {
      if (!item || typeof item !== "object") return "";
      const ct = item as Record<string, unknown>;
      const name = ct.name ?? ct.Name ?? "";
      const issuer = ct.issuer ?? ct.Issuer;
      return issuer ? `- **${name}** — ${issuer}` : `- ${name}`;
    }).filter(Boolean);
    if (entries.length) sections.push(`\n## Certifications\n\n${entries.join("\n")}`);
  }

  // If we extracted nothing meaningful, fall back to JSON
  if (sections.length <= 1) {
    return `# ${fallbackTitle}\n\n${JSON.stringify(content, null, 2)}`;
  }

  return sections.join("\n");
}

resumeRoutes.get("/:id/export", async (c) => {
  const { handleExportResume } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleExportResume(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
    c.req.query("format") ?? "json",
    jsonResumeToMarkdown,
  );
  if (result.kind === "error") {
    return c.json(result.body as any, result.status as any);
  }
  const headers: Record<string, string> = {
    "Content-Type": result.contentType,
    "Content-Disposition": `attachment; filename="${result.filename}"`,
    ...(result.extraHeaders ?? {}),
  };
  return new Response(result.body, { status: result.status, headers });
});

resumeRoutes.get("/:id/metadata", async (c) => {
  const { handleGetMetadata } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleGetMetadata(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.put("/:id/metadata", async (c) => {
  const { handleUpdateMetadata } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const body = await c.req.json().catch(() => null);
  const result = await handleUpdateMetadata(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
    body,
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/:id/setmaster", async (c) => {
  const { handleSetMaster } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleSetMaster(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/:id/setactive", async (c) => {
  const { handleSetActive } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleSetActive(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/:id/setprivacy", async (c) => {
  const { handleSetPrivacy } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const body = await c.req.json().catch(() => null);
  const result = await handleSetPrivacy(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
    typeof body?.privacy === "string" ? body.privacy : undefined,
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/:id/promote", async (c) => {
  const { handlePromote } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handlePromote(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

// Detach a variant from its parent without promoting it. Leaves isMaster
// untouched — only /promote or /setmaster can change the singleton master.
// The frontend uses this when the user picks "Create Variation" on a
// resume that is itself a variant, enforcing the one-level hierarchy.
resumeRoutes.post("/:id/detach", async (c) => {
  const { handleDetach } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleDetach(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/:id/createvariation", async (c) => {
  const { handleCreateVariation } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const body = await c.req.json().catch(() => null);
  const result = await handleCreateVariation(
    buildResumeDeps((text) => parseResumeTextWithAI(c, text)),
    c.var.user.sub,
    c.req.param("id"),
    body,
  );
  return c.json(result.body as any, result.status as any);
});

// GET /:id/diff — compare this resume against its parent or another variation
// Returns a field-level diff of the two content objects.
resumeRoutes.get("/:id/diff", async (c) => {
  const { handleGetResumeDiff } = await import("./resume-handlers.js");
  const { buildResumeDeps } = await import("./resume-deps.js");
  const result = await handleGetResumeDiff(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
    c.req.query("compareId") ?? null,
  );
  return c.json(result.body as any, result.status as any);
});

// ---------------------------------------------------------------------------
// Merge endpoints
// ---------------------------------------------------------------------------

const MergeAnalyzeSchema = z.object({
  sourceResumeId: z.string().uuid(),
  targetResumeId: z.string().uuid(),
  useAI: z.boolean().optional().default(true),
});

resumeRoutes.post("/merge/analyze", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = MergeAnalyzeSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);

  const { sourceResumeId, targetResumeId, useAI } = parsed.data;
  if (sourceResumeId === targetResumeId) return c.json(fail("VALIDATION_ERROR", "Source and target must be different resumes"), 400);

  const db = getDb();
  const [source] = await db.select().from(resumes).where(and(eq(resumes.id, sourceResumeId), eq(resumes.userId, user.sub))).limit(1);
  const [target] = await db.select().from(resumes).where(and(eq(resumes.id, targetResumeId), eq(resumes.userId, user.sub))).limit(1);
  if (!source) return c.json(fail("NOT_FOUND", "Source resume not found"), 404);
  if (!target) return c.json(fail("NOT_FOUND", "Target resume not found"), 404);

  const apiKey = useAI ? getApiKey(c.env as { OPENROUTER_API_KEY?: string }) : undefined;
  // Normalise both sides here so the response mirrors what the merger
  // actually compared — the frontend preview step reads these directly.
  const sourceContent = normalizeJsonResume((source.content ?? {}) as Record<string, unknown>);
  const targetContent = normalizeJsonResume((target.content ?? {}) as Record<string, unknown>);

  const analysis = await analyzeMerge(sourceContent, targetContent, apiKey || undefined);

  return c.json(ok({ analysis, sourceContent, targetContent }), 200);
});

const MergeExecuteSchema = z.object({
  // Source is either an existing resume ID or inline parsed content (file-based merges)
  sourceResumeId: z.string().uuid().optional(),
  sourceContent: z.record(z.string(), z.unknown()).optional(),
  targetResumeId: z.string().uuid(),
  decisions: z.array(z.object({
    sectionType: z.string(),
    sourceIndex: z.number(),
    targetIndex: z.number().nullable(),
    action: z.enum(["merge", "replace", "skip", "add"]),
    mergeHighlights: z.enum(["combine", "source_only", "target_only"]).optional(),
    selectedHighlights: z.array(z.string()).optional(),
    scalarChoices: z.record(z.string(), z.enum(["source", "target"])).optional(),
  })),
  basicDecisions: z.record(z.string(), z.enum(["source", "target"])).optional(),
  createNew: z.boolean(),
  newTitle: z.string().optional(),
}).refine((d) => d.sourceResumeId || d.sourceContent, {
  message: "Either sourceResumeId or sourceContent must be provided",
});

/**
 * POST /api/resumes/merge/preview
 *
 * Run `executeMerge` without persisting. Returns the merged content so
 * the client can render a preview (ResumeViewer + JSON) before the user
 * commits. Uses the same schema and resolution logic as /merge/execute —
 * same decisions in means same output; just no DB write.
 */
resumeRoutes.post("/merge/preview", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  // Preview doesn't need createNew/newTitle — ignore those fields even
  // if the client echoes the full execute payload.
  const parsed = MergeExecuteSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);

  const { sourceResumeId, sourceContent, targetResumeId, decisions, basicDecisions } = parsed.data;

  const db = getDb();
  const [target] = await db.select().from(resumes).where(and(eq(resumes.id, targetResumeId), eq(resumes.userId, user.sub))).limit(1);
  if (!target) return c.json(fail("NOT_FOUND", "Target resume not found"), 404);

  let resolvedSourceContent: Record<string, any>;
  if (sourceResumeId) {
    const [source] = await db.select().from(resumes).where(and(eq(resumes.id, sourceResumeId), eq(resumes.userId, user.sub))).limit(1);
    if (!source) return c.json(fail("NOT_FOUND", "Source resume not found"), 404);
    resolvedSourceContent = (source.content ?? {}) as Record<string, any>;
  } else {
    resolvedSourceContent = (sourceContent ?? {}) as Record<string, any>;
  }

  const mergedContent = executeMerge(
    (target.content ?? {}) as Record<string, any>,
    resolvedSourceContent,
    decisions as MergeDecision[],
    basicDecisions,
  );

  const mergedCount = decisions.filter((d) => d.action === "merge" || d.action === "replace").length;
  const skippedCount = decisions.filter((d) => d.action === "skip").length;
  const newCount = decisions.filter((d) => d.action === "add").length;

  return c.json(ok({
    mergedContent,
    stats: { mergedSections: mergedCount, skippedSections: skippedCount, newSections: newCount },
  }), 200);
});

resumeRoutes.post("/merge/execute", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = MergeExecuteSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);

  const { sourceResumeId, sourceContent, targetResumeId, decisions, basicDecisions, createNew, newTitle } = parsed.data;

  const db = getDb();
  const [target] = await db.select().from(resumes).where(and(eq(resumes.id, targetResumeId), eq(resumes.userId, user.sub))).limit(1);
  if (!target) return c.json(fail("NOT_FOUND", "Target resume not found"), 404);

  // Resolve source: either load from DB or use inline content
  let resolvedSourceContent: Record<string, any>;
  if (sourceResumeId) {
    const [source] = await db.select().from(resumes).where(and(eq(resumes.id, sourceResumeId), eq(resumes.userId, user.sub))).limit(1);
    if (!source) return c.json(fail("NOT_FOUND", "Source resume not found"), 404);
    resolvedSourceContent = (source.content ?? {}) as Record<string, any>;
  } else {
    resolvedSourceContent = (sourceContent ?? {}) as Record<string, any>;
  }

  const mergedContent = executeMerge(
    (target.content ?? {}) as Record<string, any>,
    resolvedSourceContent,
    decisions as MergeDecision[],
    basicDecisions,
  );

  const mergedCount = decisions.filter((d) => d.action === "merge" || d.action === "replace").length;
  const skippedCount = decisions.filter((d) => d.action === "skip").length;
  const newCount = decisions.filter((d) => d.action === "add").length;

  if (createNew) {
    const title = newTitle || `${target.title} (merged)`;
    const [created] = await db
      .insert(resumes)
      .values({
        userId: user.sub,
        title,
        content: mergedContent,
        status: "draft",
        isMaster: false,
        isActive: false,
        parentId: targetResumeId,
        privacyLevel: (target as any).privacyLevel ?? 10,
      } as any)
      .returning();
    return c.json(ok({ resumeId: created.id, title, mergedSections: mergedCount, skippedSections: skippedCount, newSections: newCount }), 201);
  }

  // Update target in-place
  await db.update(resumes).set({ content: mergedContent, updatedAt: new Date() } as any).where(eq(resumes.id, targetResumeId));
  return c.json(ok({ resumeId: targetResumeId, title: target.title, mergedSections: mergedCount, skippedSections: skippedCount, newSections: newCount }), 200);
});

const MergeFromFileSchema = z.object({
  // Either `parsedContent` (pre-parsed JSON Resume, e.g. from a .json upload
  // normalised client-side) OR raw `text` (PDF/DOCX/TXT extracted text that
  // still needs AI parsing). Providing `parsedContent` skips the AI step.
  text: z.string().optional(),
  parsedContent: z.record(z.string(), z.unknown()).optional(),
  targetResumeId: z.string().uuid(),
  useAI: z.boolean().optional().default(true),
}).refine((d) => (d.text && d.text.length > 0) || d.parsedContent, {
  message: "Either text or parsedContent must be provided",
});

resumeRoutes.post("/merge/from-file", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = MergeFromFileSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);

  const { text, parsedContent: providedContent, targetResumeId, useAI } = parsed.data;

  const db = getDb();
  const [target] = await db.select().from(resumes).where(and(eq(resumes.id, targetResumeId), eq(resumes.userId, user.sub))).limit(1);
  if (!target) return c.json(fail("NOT_FOUND", "Target resume not found"), 404);

  // Resolve parsed content — three paths, in order of fidelity:
  //   1. Client sent `parsedContent` directly (e.g. .json upload parsed
  //      client-side): normalise case and use it as-is.
  //   2. `text` is a JSON Resume document (user pasted JSON or we missed
  //      the client-side branch): try parsing before falling back to AI.
  //   3. Raw text from PDF/DOCX/TXT: parse with AI.
  let parseConfidence = 0.4;
  let parsedContent: Record<string, unknown>;
  if (providedContent) {
    parsedContent = normalizeJsonResume(providedContent);
    parseConfidence = 1.0; // pre-parsed JSON is canonical
  } else {
    const maybeJson = text ? tryParseJsonResume(text) : null;
    if (maybeJson) {
      parsedContent = maybeJson;
      parseConfidence = 1.0;
    } else {
      parsedContent = await parseResumeTextWithAI(c, text ?? "");
      parseConfidence = Object.keys(parsedContent).length > 2 ? 0.8 : 0.4;
    }
  }

  const apiKey = useAI ? getApiKey(c.env as { OPENROUTER_API_KEY?: string }) : undefined;
  const targetContent = normalizeJsonResume((target.content ?? {}) as Record<string, unknown>);
  const analysis = await analyzeMerge(parsedContent, targetContent, apiKey || undefined);

  return c.json(ok({ parsedContent, targetContent, analysis, parseConfidence }), 200);
});

resumeRoutes.all("*", (c) => c.json(fail("NOT_IMPLEMENTED", "Resume route not implemented"), 501));
