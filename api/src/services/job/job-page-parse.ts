/** Heuristic HTML → ParsedJob extraction (JSON-LD / OpenGraph / <title>).
 *  findApplyLinkInHtml + htmlToMarkdown live in shared/scraping. */
import {
  // Pure HTML helpers — single-sourced in shared/scraping so the
  // Chrome extension, frontend, and API all agree on what "stripped
  // HTML" / "markdown" mean.
  stripHtml,
  htmlToMarkdown as htmlToMarkdownShared,
  // JSON-LD JobPosting extraction.
  extractJobPostingsFromHtml,
  // Apply-URL DOM-scan fallback.
  findApplyLinkInHtml as findApplyLinkInHtmlShared,
  // LinkedIn-specific docTitle parser: "{Company} hiring {Title} in {Location} | LinkedIn".
  parseLinkedInTitleString,
} from "../../../../shared/scraping/index.js";
import { HIRED_VIDEO_SEED_COMPANY } from "./job-seed-company.js";

/**
 * Lightweight HTML → structured-job parser used by `POST /api/jobs/extract`.
 * Tries (in order):
 *   1. JSON-LD `JobPosting` (the gold standard — most ATSes emit this)
 *   2. OpenGraph `og:title` + `<meta name="description">`
 *   3. `<title>` + URL hostname as a last-resort fallback
 *
 * Pure string operations on purpose: we run inside a Cloudflare Worker so
 * there is no real DOM, and pulling in cheerio just for this one route is
 * not worth the bundle hit.
 */
export interface ParsedJob {
  title: string;
  description: string;
  company?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  isRemote?: boolean;
  jobType?: string;          // full_time, part_time, contract, internship, ...
  experienceLevel?: string;  // entry, mid, senior, executive
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  skills?: string[];
  responsibilities?: string[];
  requirements?: string[];
  qualifications?: string[];
  benefits?: string[];
  /** Direct-apply or canonical job URL extracted from JSON-LD or the source page. */
  applyUrl?: string;
  /** "high" when JSON-LD JobPosting was found, "low" otherwise. */
  confidence: "high" | "low";
}

export function parseJobFromPage(input: { url?: string; html?: string }): ParsedJob {
  const html = input.html ?? "";
  const url = input.url ?? "";

  // 1. JSON-LD JobPosting — gold standard, treat as high confidence.
  //    The extraction itself lives in shared/scraping/jsonLd.ts so the
  //    Chrome extension + frontend + API all read the same schema.org
  //    shape. We use the first JobPosting returned (multiple typically
  //    only appear on search-results pages, which are a misuse of this
  //    single-job extractor — upstream callers prefilter).
  const jsonLdJobs = extractJobPostingsFromHtml(html);
  if (jsonLdJobs.length > 0) {
    const posting = jsonLdJobs[0];

    // Apply URL priority — we compose here rather than in shared because
    // only the API has the "fall back to the request URL" convention:
    //   1. JSON-LD directApply (explicit apply link)
    //   2. JSON-LD url (canonical job page — often = the listing page)
    //   3. DOM heuristic: an <a> matching apply-button patterns
    //      (Home Depot's JSON-LD has no directApply; the listing page
    //      links to `myworkdayjobs.com` directly)
    //   4. The inbound request URL itself
    const applyUrl =
      posting.directApplyUrl ||
      posting.canonicalUrl ||
      findApplyLinkInHtmlShared(html, url) ||
      url ||
      undefined;

    return {
      title: posting.title || fallbackTitle(url),
      // shared returns the raw description string; convert to markdown
      // here and fall through to the whole-page markdown when the
      // JobPosting didn't ship a description at all.
      description:
        htmlToMarkdownShared(posting.description ?? "") ||
        htmlToMarkdownShared(html).slice(0, 8000),
      company: posting.company || HIRED_VIDEO_SEED_COMPANY,
      location: posting.location,
      city: posting.city,
      state: posting.state,
      country: posting.country,
      isRemote: posting.isRemote,
      jobType: posting.jobType,
      experienceLevel: undefined, // schema.org has no direct field
      salaryMin: posting.salaryMin,
      salaryMax: posting.salaryMax,
      salaryCurrency: posting.salaryCurrency,
      skills: posting.skills,
      responsibilities: posting.responsibilities,
      requirements: posting.requirements,
      qualifications: posting.qualifications,
      benefits: posting.benefits,
      applyUrl,
      confidence: "high",
    };
  }

  // 2. OpenGraph + meta description fallback — low confidence, AI must verify.
  const ogTitle = matchMeta(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const ogDesc = matchMeta(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const metaDesc = matchMeta(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const ogSite = matchMeta(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
  const docTitle = matchMeta(html, /<title[^>]*>([^<]+)<\/title>/i);

  // LinkedIn doesn't emit JSON-LD on /jobs/view/{id}/ but its <title>
  // tag carries everything we need: "{Company} hiring {Title} in {Location} | LinkedIn".
  // Parse it before falling back to og:title/docTitle so we land on the
  // actual job title (and pick up company + location for free) instead of
  // "Job from linkedin.com".
  const liDocParse = parseLinkedInTitleString(docTitle);

  const title = liDocParse?.title || ogTitle || docTitle || fallbackTitle(url);
  const markdown = htmlToMarkdownShared(html);
  const description = markdown || ogDesc || metaDesc || url;

  return {
    title: title.slice(0, 250),
    description: description.slice(0, 8000),
    company: liDocParse?.company || ogSite || undefined,
    location: liDocParse?.location || undefined,
    isRemote: undefined,
    applyUrl: findApplyLinkInHtmlShared(html, url) || url || undefined,
    confidence: "low",
  };
}

function matchMeta(html: string, pattern: RegExp): string | undefined {
  const m = html.match(pattern);
  return m?.[1]?.trim();
}

function fallbackTitle(url: string): string {
  try {
    const u = new URL(url);
    return `Job from ${u.hostname.replace(/^www\./, "")}`;
  } catch {
    return "Tracked Job";
  }
}

/** Parse a schema.org `QuantitativeValue` field into a number. */
function numericFromQuantitativeValue(value: unknown, key: "minValue" | "maxValue" | "value"): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = (value as Record<string, unknown>)[key];
  const n = typeof raw === "string" ? Number(raw) : (raw as number | undefined);
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/** Coerce a value that might be a comma-separated string OR a string[] into string[]. */
function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => stripHtml(String(v))).filter((s) => s.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;\n•·]/)
      .map((s) => stripHtml(s))
      .filter((s) => s.length > 0);
  }
  return [];
}
