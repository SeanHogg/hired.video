import { Hono } from "hono";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { callLLM, getApiKey } from "../services/ai.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import { analyzeMerge, executeMerge, type MergeDecision } from "../services/resume-merge.js";
import {
  buildMetaResume,
  extractJson as extractJsonUtil,
  isParseComplete as isParseCompleteUtil,
  parseResumeWithRegex as parseResumeWithRegexUtil,
  ciGet,
  normalizeJsonResume,
  tryParseJsonResume,
} from "../services/resume-parse.js";
import { extractPdfText } from "../utils/pdf-extract.js";

const { resumeInformation: resumes, watchedResumes } = schema;

export const resumeRoutes = new Hono<{ Variables: Variables }>();

const CreateResumeSchema = z.object({
  title: z.string().min(1),
  content: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  isMaster: z.boolean().optional().default(false),
  privacy: z.string().optional(),
  rawText: z.string().optional(),
});

const UpdateResumeSchema = CreateResumeSchema.partial();

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Map privacy string → stored integer
const PRIVACY_TO_LEVEL: Record<string, number> = {
  public: 0,
  recruiter_only: 1,
  connections: 2,
  private: 10,
  draft: 10,
};

// Reverse map: stored integer → privacy string
const LEVEL_TO_PRIVACY: Record<number, string> = {
  0: "public",
  1: "recruiter_only",
  2: "connections",
  10: "private",
};

function rowToLegacyResume(row: typeof resumes.$inferSelect) {
  const c = (row.content ?? {}) as Record<string, unknown>;
  const rid = row.id;

  return {
    id: rid,
    userId: row.userId,
    name: row.title,
    slug: row.slug ?? rid,
    description: "",
    isPrimaryDefault: false,
    isWatched: false,
    sentimentScore: 0,
    privacy_ShowResume: row.privacyLevel,
    resumeSerialized: JSON.stringify(row.content ?? {}),
    isMaster: row.isMaster,
    isActive: row.isActive,
    parentId: row.parentId ?? null,
    creationDateTime: new Date(row.createdAt).toISOString(),
    updateDateTime: new Date(row.updatedAt).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    views: 0,
    metaData: Array.isArray(ciGet(c, "metaData")) ? ciGet(c, "metaData") : undefined,
    metaResume: buildMetaResume(c, rid, row.title),
  };
}

/**
 * Merge an incoming resume `content` blob with the metaData (media attachments)
 * from the existing row. Media is managed by the dedicated PUT /:id/metadata
 * endpoint and the ResumeBuilder never includes it in its payload, so blindly
 * writing `content` from a resume edit would wipe out the user's associated
 * media. Callers that deliberately pass a `metaData` field are respected.
 *
 * Exported so it can be unit-tested without spinning up the DB.
 */
export function preserveMetaData(
  nextContent: unknown,
  existingMetaData: unknown,
): unknown {
  if (!nextContent || typeof nextContent !== "object") return nextContent;
  const next = nextContent as Record<string, unknown>;
  if (next.metaData !== undefined) return next;
  if (existingMetaData === undefined) return next;
  return { ...next, metaData: existingMetaData };
}

export function rowToSummary(
  row: typeof resumes.$inferSelect,
  currentUserId?: string | null,
) {
  const content = (row.content ?? {}) as Record<string, unknown>;
  const basics = (content.basics ?? content.Basics ?? {}) as Record<string, unknown>;
  const summary = (basics.summary ?? basics.Summary ?? "") as string;
  const isOwner = Boolean(currentUserId && row.userId === currentUserId);

  return {
    Id: row.id,
    TemplateName: "Default",
    IsPublic: row.privacyLevel === 0,
    IsOwner: isOwner,
    CreationDateTimeFormatted: new Date(row.createdAt).toISOString(),
    UpdatedAt: new Date(row.updatedAt).toISOString(),
    SentimentScore: 0,
    UserId: row.userId,
    Name: row.title,
    Slug: row.slug ?? row.id,
    Description: summary,
    Privacy: LEVEL_TO_PRIVACY[row.privacyLevel] ?? "private",
    IsMaster: row.isMaster,
    IsActive: row.isActive,
    ParentId: row.parentId ?? null,
    IsPrimaryDefault: false,
    IsWatched: false,
    Latitude: null,
    Longitude: null,
    Location: "",
  };
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
  skills: `Extract ONLY skills. Return JSON: { "skills": [{ "name": "<category>", "keywords": ["skill1", "skill2"] }] }`,
  certificates: `Extract ONLY certifications/licenses. Return JSON: { "certificates": [{ "name": "", "issuer": "", "date": "" }] }`,
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

// Modern plural endpoints — also exported so app.ts can register them at the mount root
// (Hono sub-router root "/" never matches when mounted with app.route(prefix, router))
export const listResumesHandler = async (c: any) => {
  const user = c.var.user;
  const db = getDb();
  const rows = await db.select().from(resumes).where(eq(resumes.userId, user.sub)).orderBy(resumes.updatedAt);
  return c.json(ok(rows.map(rowToLegacyResume)), 200);
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
  const [created] = await db
    .insert(resumes)
    .values({
      userId: user.sub,
      title: parsed.data.title,
      content,
      status: parsed.data.status,
      isMaster: parsed.data.isMaster ?? false,
      privacyLevel,
    } as any)
    .returning();

  return c.json(ok(rowToLegacyResume(created)), 201);
};

// Register at both "" and "/" — Hono sub-router path stripping can vary
resumeRoutes.get("", listResumesHandler);
resumeRoutes.get("/", listResumesHandler);
resumeRoutes.post("", createResumeHandler);
resumeRoutes.post("/", createResumeHandler);

// Legacy resume endpoints used by frontend services
resumeRoutes.get("/public", async (c) => {
  const page = Number(c.req.query("page") ?? 1) || 1;
  const limit = Math.min(Number(c.req.query("limit") ?? 20) || 20, 100);
  const db = getDb();
  const currentUserId = c.var.user?.sub ?? null;
  // Only return resumes with privacyLevel = 0 (public)
  const rows = await db
    .select()
    .from(resumes)
    .where(eq(resumes.privacyLevel, 0))
    .orderBy(resumes.updatedAt)
    .limit(limit)
    .offset((page - 1) * limit);

  return c.json(
    ok({
      items: rows.map((row) => rowToSummary(row, currentUserId)),
      total: rows.length,
      page,
      limit,
      hasNext: rows.length === limit,
      hasPrev: page > 1,
    }),
    200,
  );
});

resumeRoutes.get("/public/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();

  const condition = UUID_RE.test(slug)
    ? and(eq(resumes.id, slug), eq(resumes.privacyLevel, 0))
    : and(eq(resumes.slug, slug), eq(resumes.privacyLevel, 0));

  const [row] = await db.select().from(resumes).where(condition).limit(1);
  if (!row) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  return c.json(ok(rowToLegacyResume(row)), 200);
});

resumeRoutes.get("/getresumesownedbyauthuser", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const rows = await db.select().from(resumes).where(eq(resumes.userId, user.sub));
  return c.json(ok(rows.map((row) => rowToSummary(row, user.sub))), 200);
});

resumeRoutes.get("/withownership", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const rows = await db.select().from(resumes).where(eq(resumes.userId, user.sub));
  const result = rows.map((r) => {
    const content = (r.content ?? {}) as Record<string, unknown>;
    const basics = (content.basics ?? content.Basics ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      slug: r.slug ?? r.id,
      name: r.title ?? "",
      title: r.title ?? "",
      privacy: LEVEL_TO_PRIVACY[r.privacyLevel] ?? "private",
      isMaster: r.isMaster,
      isActive: r.isActive,
      parentId: r.parentId ?? null,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
      views: 0,
      summary: (basics.summary ?? basics.Summary ?? "") as string,
      userId: r.userId,
      ownership: "owned" as const,
    };
  });
  return c.json(ok(result), 200);
});

resumeRoutes.get("/mastergroups", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const all = await db.select().from(resumes).where(eq(resumes.userId, user.sub));
  const masters = all.filter((r) => r.isMaster && !r.parentId);
  const variations = all.filter((r) => !!r.parentId);
  // Ungrouped non-master root resumes stand alone as single-item groups
  const ungrouped = all.filter((r) => !r.isMaster && !r.parentId);
  const masterGroups = [
    ...masters.map((m) => ({
      masterResume: rowToLegacyResume(m),
      variations: variations.filter((v) => v.parentId === m.id).map(rowToLegacyResume),
    })),
    ...ungrouped.map((r) => ({ masterResume: rowToLegacyResume(r), variations: [] })),
  ];
  return c.json(ok(masterGroups), 200);
});

resumeRoutes.get("/validateslug", async (c) => {
  const user = c.var.user;
  const slug = c.req.query("slug") ?? "";
  const resumeId = c.req.query("resumeId");
  if (!slug) return c.json(ok({ slug, available: false }), 200);
  const db = getDb();
  const conditions = resumeId
    ? and(eq(resumes.userId, user.sub), eq(resumes.slug, slug), ne(resumes.id, resumeId))
    : and(eq(resumes.userId, user.sub), eq(resumes.slug, slug));
  const [existing] = await db.select({ id: resumes.id }).from(resumes).where(conditions).limit(1);
  return c.json(ok({ slug, available: !existing }), 200);
});

// Mounted under optionalAuthMiddleware (see app.ts OPTIONAL_AUTH_PUBLIC_ROUTE)
// so anonymous callers can embed public resumes (chrome extension, job-profile
// embeds, social feed). Owners can additionally embed their own private resumes.
resumeRoutes.get("/embedded/:identifier", async (c) => {
  const identifier = c.req.param("identifier");
  const callerSub = c.var.user?.sub ?? null;
  const db = getDb();

  const condition = UUID_RE.test(identifier)
    ? eq(resumes.id, identifier)
    : eq(resumes.slug, identifier);

  const [row] = await db.select().from(resumes).where(condition).limit(1);
  if (!row) return c.json(fail("NOT_FOUND", "Resume not found"), 404);

  const isOwner = !!callerSub && row.userId === callerSub;
  const isPublic = row.privacyLevel === 0;
  if (!isOwner && !isPublic) {
    // Resume exists but caller has no access. We intentionally surface this as
    // distinct from NOT_FOUND — owners share links and need people to be told
    // "private, ask me to share it" rather than "doesn't exist". Status stays
    // 404 so crawlers don't index restricted content.
    return c.json(
      fail("RESUME_PRIVATE", "This resume is private. Ask the owner to share it with you."),
      404,
    );
  }

  return c.json(ok(rowToLegacyResume(row)), 200);
});

resumeRoutes.post("/save", async (c) => {
  const user = c.var.user;
  const content = await parseBodyToContent(c);
  const title = typeof (content as any).name === "string" ? (content as any).name : "Untitled Resume";

  const db = getDb();
  const [created] = await db
    .insert(resumes)
    .values({ userId: user.sub, title, content, status: "draft" } as any)
    .returning();

  return c.json(ok(rowToLegacyResume(created)), 201);
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

resumeRoutes.post("/createfromfile", async (c) => {
  const user = c.var.user;
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  const text = file ? await file.text().catch(() => "") : "";

  // If the upload is a JSON Resume export (PascalCase or lowercase), store
  // the structured content directly instead of { raw: text } — the latter
  // forces every downstream consumer (viewer, exporter, merge, scorer)
  // through regex/AI re-parsing and loses all structure.
  const lower = file?.name?.toLowerCase() ?? "";
  const isJson = file?.type === "application/json" || lower.endsWith(".json");
  const structured = isJson ? tryParseJsonResume(text) : null;

  const content = structured ?? { raw: text };
  const title = deriveTitleFromContent(content, file?.name) || "Uploaded Resume";

  const db = getDb();
  const [created] = await db
    .insert(resumes)
    .values({ userId: user.sub, title, content, status: "draft" } as any)
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

  // If the payload is a JSON Resume document, store it structured.
  const structured = tryParseJsonResume(text);
  const content = structured ?? { raw: text };
  const finalTitle = structured
    ? (deriveTitleFromContent(structured) || title)
    : title;

  const db = getDb();
  const [created] = await db
    .insert(resumes)
    .values({
      userId: user.sub,
      title: finalTitle,
      content,
      status: "draft",
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
  const body = await c.req.json().catch(() => null);
  const value = typeof body === "string" ? body : JSON.stringify(body ?? "");
  const score = value.length > 300 ? 78 : value.length > 80 ? 64 : 52;
  // Object-wrapped for envelope consistency (roadmap #147).
  return c.json(ok({ score }), 200);
});

resumeRoutes.post("/watch/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  const [existing] = await db
    .select({ id: watchedResumes.id })
    .from(watchedResumes)
    .where(and(eq(watchedResumes.viewerId, user.sub), eq(watchedResumes.resumeId, id)))
    .limit(1);
  if (!existing) {
    await db.insert(watchedResumes).values({ viewerId: user.sub, resumeId: id } as any);
  }
  return c.json(ok({ success: true }), 200);
});

resumeRoutes.post("/unwatch/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  await db.delete(watchedResumes).where(and(eq(watchedResumes.viewerId, user.sub), eq(watchedResumes.resumeId, id)));
  return c.json(ok({ success: true }), 200);
});

// Dynamic routes below static routes
// Mounted under optionalAuthMiddleware via PUBLIC_RESUME_DETAIL_ROUTE in app.ts.
// Access policy: owner always wins; anyone else only sees public resumes.
// Privacy-blocked requests return 404 with code="RESUME_PRIVATE" so that when
// owners share a link, the recipient is told the resume is private (prompting
// them to ask for access) rather than seeing a generic "doesn't exist" error.
resumeRoutes.get("/:id", async (c) => {
  const callerSub = c.var.user?.sub ?? null;
  const id = c.req.param("id");
  const db = getDb();

  const condition = UUID_RE.test(id) ? eq(resumes.id, id) : eq(resumes.slug, id);

  const [row] = await db.select().from(resumes).where(condition).limit(1);
  if (!row) return c.json(fail("NOT_FOUND", "Resume not found"), 404);

  const isOwner = !!callerSub && row.userId === callerSub;
  const isPublic = row.privacyLevel === 0;
  if (!isOwner && !isPublic) {
    return c.json(
      fail("RESUME_PRIVATE", "This resume is private. Ask the owner to share it with you."),
      404,
    );
  }

  return c.json(ok(rowToLegacyResume(row)), 200);
});

resumeRoutes.put("/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateResumeSchema.safeParse(body);
  const db = getDb();

  // Slug arrives as a querystring param from updateResumeData on the frontend.
  // Reject UUID-shaped slugs since the GET handler treats UUIDs as ids.
  let slugUpdate: { slug: string } | undefined;
  const slugQuery = c.req.query("slug");
  if (typeof slugQuery === "string" && slugQuery.trim().length > 0) {
    const slug = slugQuery.trim();
    if (UUID_RE.test(slug)) {
      return c.json(fail("INVALID_SLUG", "Slug must not look like a UUID"), 400);
    }
    const [taken] = await db
      .select({ id: resumes.id })
      .from(resumes)
      .where(and(eq(resumes.userId, user.sub), eq(resumes.slug, slug), ne(resumes.id, id)))
      .limit(1);
    if (taken) {
      return c.json(fail("SLUG_TAKEN", "Slug is already in use"), 409);
    }
    slugUpdate = { slug };
  }

  // Metadata (media attachments) lives inside content.metaData and is managed
  // by a separate PUT /:id/metadata endpoint. The ResumeBuilder doesn't carry
  // metaData in its edit payload, so we must preserve it from the existing
  // row — otherwise every resume edit wipes out the user's associated media.
  const [existing] = await db
    .select({ content: resumes.content })
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
    .limit(1);
  const existingMetaData = (existing?.content as Record<string, unknown> | null)
    ?.metaData;

  const mergeNextMetaData = (nextContent: unknown) =>
    preserveMetaData(nextContent, existingMetaData);

  if (parsed.success) {
    // Map schema fields to actual DB columns
    const { privacy, rawText, ...dbFields } = parsed.data;
    const setData: Record<string, unknown> = { ...dbFields, ...(slugUpdate ?? {}), updatedAt: new Date() };
    if (setData.content !== undefined) {
      setData.content = mergeNextMetaData(setData.content);
    }
    if (privacy !== undefined) {
      setData.privacyLevel = PRIVACY_TO_LEVEL[privacy] ?? 10;
    }
    const [updated] = await db
      .update(resumes)
      .set(setData as any)
      .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
      .returning();
    if (!updated) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
    return c.json(ok(rowToLegacyResume(updated)), 200);
  }

  // Legacy update path where body is serialized resume content string literal
  const content = mergeNextMetaData(await parseBodyToContent(c));
  const [updated] = await db
    .update(resumes)
    .set({ content, ...(slugUpdate ?? {}), updatedAt: new Date() } as any)
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
    .returning();
  if (!updated) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  return c.json(ok(rowToLegacyResume(updated)), 200);
});

resumeRoutes.delete("/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  const [existing] = await db.select({ id: resumes.id, isMaster: resumes.isMaster }).from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub))).limit(1);
  if (!existing) return c.json(fail("NOT_FOUND", "Resume not found"), 404);

  // If deleting a master, unparent its variations so they become standalone
  // resumes instead of being orphaned.
  if (existing.isMaster) {
    await db
      .update(resumes)
      .set({ parentId: null, updatedAt: new Date() } as any)
      .where(and(eq(resumes.parentId, id), eq(resumes.userId, user.sub)));
  }

  // Defense-in-depth: include userId in the DELETE WHERE clause so that a
  // future refactor that drops the existence check above can't silently
  // become an authorization bypass.
  await db.delete(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)));
  return c.json(ok(undefined), 200);
});

resumeRoutes.post("/:id/clone", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  const [original] = await db.select().from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub))).limit(1);
  if (!original) return c.json(fail("NOT_FOUND", "Resume not found"), 404);

  const [cloned] = await db
    .insert(resumes)
    .values({ userId: user.sub, title: `${original.title} (copy)`, content: original.content ?? {}, status: "draft" } as any)
    .returning();

  return c.json(ok(rowToLegacyResume(cloned)), 201);
});

resumeRoutes.post("/:id/publish", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  const [updated] = await db
    .update(resumes)
    .set({ status: "published", updatedAt: new Date() } as any)
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
    .returning();
  if (!updated) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  return c.json(ok(rowToLegacyResume(updated)), 200);
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
  const id = c.req.param("id");
  const user = c.var.user;
  const format = (c.req.query("format") ?? "json").toLowerCase();
  const db = getDb();

  const [row] = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
    .limit(1);

  if (!row) return c.json(fail("NOT_FOUND", "Resume not found"), 404);

  const content = row.content as Record<string, unknown> | null;

  // Resolve markdown: prefer stored markdown, then convert JSON Resume to markdown
  const resolveMarkdown = () =>
    typeof content?.markdown === "string"
      ? content.markdown
      : jsonResumeToMarkdown(content, row.title);

  if (format === "md" || format === "markdown") {
    return new Response(resolveMarkdown(), {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${row.title.replace(/[^a-z0-9]/gi, "_")}.md"`,
      },
    });
  }

  if (format === "pdf" || format === "docx") {
    // PDF/DOCX generation requires an external rendering service (e.g. Puppeteer,
    // Gotenberg, or a managed PDF API). Until one is configured, return the
    // markdown so the Chrome extension can still download something useful.
    return new Response(resolveMarkdown(), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${row.title.replace(/[^a-z0-9]/gi, "_")}.txt"`,
        "X-Export-Note": "PDF/DOCX rendering not yet available; content returned as plain text",
      },
    });
  }

  // Default: JSON export
  const exportPayload = JSON.stringify({ id: row.id, title: row.title, content, exportedAt: new Date().toISOString() }, null, 2);
  return new Response(exportPayload, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${row.title.replace(/[^a-z0-9]/gi, "_")}.json"`,
    },
  });
});

resumeRoutes.get("/:id/metadata", async (c) => {
  const id = c.req.param("id");
  const user = c.var.user;
  const db = getDb();
  const [row] = await db.select().from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub))).limit(1);
  if (!row) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  const content = (row.content ?? {}) as Record<string, unknown>;
  return c.json(ok(Array.isArray(content.metaData) ? content.metaData : []), 200);
});
resumeRoutes.put("/:id/metadata", async (c) => {
  const id = c.req.param("id");
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const metaData = Array.isArray(body) ? body : [];
  const db = getDb();
  const [row] = await db.select().from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub))).limit(1);
  if (!row) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  const content = (row.content && typeof row.content === "object" ? { ...(row.content as Record<string, unknown>) } : {}) as Record<string, unknown>;
  content.metaData = metaData;
  const [updated] = await db
    .update(resumes)
    .set({ content, updatedAt: new Date() } as any)
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
    .returning();
  if (!updated) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  return c.json(ok(rowToLegacyResume(updated)), 200);
});

resumeRoutes.post("/:id/setmaster", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  const [found] = await db.select({ id: resumes.id }).from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub))).limit(1);
  if (!found) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  await db.update(resumes).set({ isMaster: false } as any).where(eq(resumes.userId, user.sub));
  await db.update(resumes).set({ isMaster: true } as any).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)));
  return c.json(ok(true), 200);
});

resumeRoutes.post("/:id/setactive", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  const [found] = await db.select({ id: resumes.id }).from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub))).limit(1);
  if (!found) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  await db.update(resumes).set({ isActive: false } as any).where(eq(resumes.userId, user.sub));
  await db.update(resumes).set({ isActive: true } as any).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)));
  return c.json(ok(true), 200);
});

resumeRoutes.post("/:id/setprivacy", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const privacy = typeof body?.privacy === "string" ? body.privacy : "private";
  const privacyLevel = PRIVACY_TO_LEVEL[privacy] ?? 10;
  const db = getDb();
  const [updated] = await db
    .update(resumes)
    .set({ privacyLevel, updatedAt: new Date() } as any)
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
    .returning({ id: resumes.id });
  if (!updated) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  return c.json(ok(true), 200);
});

resumeRoutes.post("/:id/promote", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  const [found] = await db.select({ id: resumes.id }).from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub))).limit(1);
  if (!found) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  await db.update(resumes).set({ isMaster: false } as any).where(eq(resumes.userId, user.sub));
  await db.update(resumes).set({ isMaster: true, parentId: null } as any).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)));
  return c.json(ok(true), 200);
});

resumeRoutes.post("/:id/createvariation", async (c) => {
  const id = c.req.param("id");
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : undefined;
  const db = getDb();
  const [parent] = await db.select().from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub))).limit(1);
  if (!parent) return c.json(fail("NOT_FOUND", "Resume not found"), 404);

  // Start with the parent's structured content as a base.
  const baseContent: Record<string, unknown> = typeof parent.content === "object" && parent.content !== null
    ? { ...(parent.content as Record<string, unknown>) }
    : {};

  const markdownText = typeof body?.resumeData === "string" ? body.resumeData.trim() : "";

  if (markdownText) {
    // Keep the raw markdown for export/display.
    baseContent.markdown = markdownText;

    // Parse the markdown back into the canonical JSON Resume structure
    // so that scoring, analysis, and all downstream consumers work from
    // structured data — not raw text.
    try {
      const parsed = await parseResumeTextWithAI(c, markdownText);
      if (parsed && typeof parsed === "object") {
        // Overwrite structured fields with freshly parsed data, keeping
        // markdown and variationDescription alongside.
        for (const key of ["basics", "work", "education", "skills",
          "volunteer", "awards", "certificates", "publications",
          "languages", "interests", "references", "projects"]) {
          if ((parsed as any)[key] !== undefined) {
            baseContent[key] = (parsed as any)[key];
          }
        }
      }
    } catch (parseErr) {
      console.warn("[createvariation] AI parse of markdown failed, keeping parent JSON:", parseErr);
      // Non-fatal — variation is still created with parent's JSON + markdown
    }
  }

  if (typeof body?.description === "string") {
    baseContent.variationDescription = body.description;
  }

  const [created] = await db
    .insert(resumes)
    .values({
      userId: user.sub,
      title: name ?? `${parent.title} Variation`,
      content: baseContent,
      status: "draft",
      parentId: parent.id,
      isMaster: false,
      isActive: false,
      privacyLevel: 10, // variations are always private
    } as any)
    .returning();
  return c.json(ok(rowToLegacyResume(created)), 201);
});

// GET /:id/diff — compare this resume against its parent or another variation
// Returns a field-level diff of the two content objects.
resumeRoutes.get("/:id/diff", async (c) => {
  const id = c.req.param("id");
  const user = c.var.user;
  const db = getDb();

  const [resume] = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
    .limit(1);

  if (!resume) return c.json(fail("NOT_FOUND", "Resume not found"), 404);

  // Compare against parentId if provided, otherwise compare against the master
  const compareId = c.req.query("compareId") ?? (resume as any).parentId;
  if (!compareId) {
    return c.json(ok({ message: "No parent or compareId to diff against", changes: [] }), 200);
  }

  const [other] = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, compareId), eq(resumes.userId, user.sub)))
    .limit(1);

  if (!other) return c.json(fail("NOT_FOUND", "Comparison resume not found"), 404);

  // Simple field-level diff on content objects
  const aContent = (resume.content ?? {}) as Record<string, unknown>;
  const bContent = (other.content ?? {}) as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(aContent), ...Object.keys(bContent)]);

  const changes: Array<{ field: string; type: "added" | "removed" | "changed"; before: unknown; after: unknown }> = [];
  for (const key of allKeys) {
    const before = bContent[key];
    const after = aContent[key];
    const beforeStr = JSON.stringify(before);
    const afterStr = JSON.stringify(after);
    if (beforeStr === afterStr) continue;
    if (before === undefined) changes.push({ field: key, type: "added", before: null, after });
    else if (after === undefined) changes.push({ field: key, type: "removed", before, after: null });
    else changes.push({ field: key, type: "changed", before, after });
  }

  return c.json(ok({
    resumeId: resume.id,
    compareId: other.id,
    resumeTitle: resume.title,
    compareTitle: other.title,
    changes,
    summary: { total: changes.length, added: changes.filter((c) => c.type === "added").length, removed: changes.filter((c) => c.type === "removed").length, changed: changes.filter((c) => c.type === "changed").length },
  }), 200);
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
