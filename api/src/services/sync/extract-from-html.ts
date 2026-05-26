/**
 * Vendor Sync — page-HTML → JSON Resume extractor.
 *
 * Single LLM pipeline shared by every connector that supports DOM-scraped
 * imports. Connectors don't own per-vendor extraction logic — they just
 * declare `supportsExtensionExtract: true`; the extension scrapes the
 * profile pane HTML, posts it here, and the LLM produces a strict JSON
 * Resume blob suitable to feed into `analyzeMerge` as `sourceContent`.
 *
 * Why a JSON-Resume-shaped extractor instead of reusing
 * `recruiter/extract-profile`:
 *
 *   The recruiter route returns `{ name, title, company, experience[],
 *   education[], skills[] }` — a flat candidate-card shape, not the
 *   work[]/education[]/skills[]/projects[] tree the merge engine expects.
 *   Round-tripping the recruiter shape into JSON Resume on the seeker
 *   side would be lossy (e.g. `experience.duration` is a free-text
 *   "2y 3m" instead of `startDate`/`endDate`). Logged as a future
 *   convergence in the gap register.
 */

import { z } from "zod";
import type { LLMClient } from "../adapters/llm-client.js";

const BasicsSchema = z.object({
  name: z.string().optional().default(""),
  label: z.string().optional().default(""),
  email: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  url: z.string().optional().default(""),
  summary: z.string().optional().default(""),
  location: z.object({
    city: z.string().optional().default(""),
    region: z.string().optional().default(""),
    countryCode: z.string().optional().default(""),
  }).partial().optional(),
}).partial();

const WorkSchema = z.object({
  name: z.string().optional().default(""),
  position: z.string().optional().default(""),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  summary: z.string().optional().default(""),
  url: z.string().optional().default(""),
  highlights: z.array(z.string()).optional().default([]),
}).partial();

const EducationSchema = z.object({
  institution: z.string().optional().default(""),
  area: z.string().optional().default(""),
  studyType: z.string().optional().default(""),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  score: z.string().optional().default(""),
  courses: z.array(z.string()).optional().default([]),
}).partial();

const SkillSchema = z.object({
  name: z.string(),
  level: z.string().optional().default(""),
  keywords: z.array(z.string()).optional().default([]),
});

const ProjectSchema = z.object({
  name: z.string().optional().default(""),
  description: z.string().optional().default(""),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  url: z.string().optional().default(""),
  highlights: z.array(z.string()).optional().default([]),
  keywords: z.array(z.string()).optional().default([]),
}).partial();

export const ExtractedJsonResumeSchema = z.object({
  basics: BasicsSchema.optional(),
  work: z.array(WorkSchema).optional().default([]),
  education: z.array(EducationSchema).optional().default([]),
  skills: z.array(SkillSchema).optional().default([]),
  projects: z.array(ProjectSchema).optional().default([]),
});

export type ExtractedJsonResume = z.infer<typeof ExtractedJsonResumeSchema>;

const MAX_HTML_TEXT_CHARS = 18_000;

/** Strip HTML to plain text within an LLM-friendly bound. Mirrors the
 *  recruiter extract preprocessor — same constraints (no script/style,
 *  collapse whitespace, hard cap) — but a wider cap because seeker
 *  profiles are typically richer than the recruiter sourcing pane. */
function htmlToPlain(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_HTML_TEXT_CHARS);
}

/** Vendor-specific hints that bias the LLM toward a section layout. The
 *  prompt is generic, but giving it the connector id lets the model
 *  prefer LinkedIn's "Experience" / "About" labels over Indeed's
 *  "Work experience" / "Summary" when extracting. */
const VENDOR_HINTS: Record<string, string> = {
  linkedin:
    "LinkedIn `/in/<handle>` profile. Sections appear as: Headline (basics.label), About (basics.summary), Experience (work[]), Education (education[]), Skills (skills[]). Dates are 'Month YYYY' or 'YYYY' — convert to ISO 'YYYY-MM' or 'YYYY'. 'Present' end dates → leave endDate empty.",
  indeed:
    "Indeed Resume page. Sections: Headline, Summary, Work experience, Education, Skills. Map directly to JSON Resume fields.",
  glassdoor:
    "Glassdoor profile page. Sections: About, Work history, Education, Skills.",
  ziprecruiter:
    "ZipRecruiter candidate profile. Sections: Profile blurb (basics.summary, ~600 char soft limit), Work experience, Education, Skills.",
  monster:
    "Monster profile page. Sections: Highlights (basics.summary), Experience, Education, Skills.",
};

export interface ExtractFromHtmlInput {
  /** Raw outer HTML of the focused profile pane. Stripped + truncated
   *  inside this function — callers don't need to preprocess. */
  html: string;
  sourceUrl: string;
  connectorId: string;
}

export async function extractFromHtml(
  llm: LLMClient,
  input: ExtractFromHtmlInput,
  featureKey = "vendor_extract_html",
): Promise<ExtractedJsonResume> {
  const plainText = htmlToPlain(input.html);
  const hint = VENDOR_HINTS[input.connectorId] ?? "Generic profile page; map fields to the closest JSON Resume slot.";

  const systemPrompt = [
    "You convert an external profile page into the JSON Resume schema (jsonresume.org).",
    "",
    "RULES:",
    "  - Output ONLY a JSON object matching the requested shape. No prose, no markdown fence.",
    "  - Date format: 'YYYY' or 'YYYY-MM'. 'Present'/'Now'/'Current' → empty endDate.",
    "  - Skills: each item is { name, keywords[] }. Drop empty/duplicate names.",
    "  - work[].name = company; work[].position = role; highlights = bullets under that role.",
    "  - basics.label = headline / current title (one line).",
    "  - basics.summary = the about/bio section (multi-line preserved with \\n).",
    "  - If a field can't be confidently located, OMIT it. Don't fabricate.",
    "",
    `VENDOR CONTEXT: ${hint}`,
  ].join("\n");

  const userMessage = [
    `Source URL: ${input.sourceUrl}`,
    "",
    "Profile page text:",
    plainText,
    "",
    "Return JSON: { basics, work, education, skills, projects }.",
  ].join("\n");

  const { data } = await llm.callJson(
    featureKey,
    {
      systemPrompt,
      userMessage,
      responseFormat: "json_object",
      useCase: "vendor_extract",
    },
    ExtractedJsonResumeSchema,
  );
  return data;
}
