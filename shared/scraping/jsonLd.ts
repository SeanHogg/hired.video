/**
 * Parse schema.org JobPosting blocks out of a raw HTML page.
 *
 * Pure string + JSON ops. Every JSON-LD `<script>` tag in the page is
 * isolated via regex, JSON-parsed inside a try/catch (so malformed blocks
 * don't kill the whole extraction), then scanned for `@type: "JobPosting"`.
 * Supports both top-level objects and `@graph` wrappers.
 */

import { stripHtml } from "./htmlUtils.js";

export interface JobPostingJsonLd {
  title: string;
  description?: string;
  company?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  isRemote?: boolean;
  jobType?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  skills?: string[];
  responsibilities?: string[];
  requirements?: string[];
  qualifications?: string[];
  benefits?: string[];
  /** The `url` field on the JobPosting (usually the canonical listing page). */
  canonicalUrl?: string;
  /** The `directApply` field on the JobPosting (employer's apply URL). */
  directApplyUrl?: string;
  /** Whatever was supplied as the most direct apply URL. */
  applyUrl?: string;
}

const JSON_LD_BLOCK_RE =
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/**
 * Return EVERY JobPosting object found in the page HTML. Typically
 * there's zero or one — but LinkedIn search pages sometimes emit a
 * JSON-LD block per visible job card, and some ATS bundles embed both
 * the listing and the org. The caller decides which one to use.
 */
export function extractJobPostingsFromHtml(html: string): JobPostingJsonLd[] {
  const results: JobPostingJsonLd[] = [];
  if (!html) return results;

  const matches = html.match(JSON_LD_BLOCK_RE) ?? [];
  for (const block of matches) {
    const inner = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>\s*$/, "").trim();
    if (!inner) continue;
    let data: unknown;
    try {
      data = JSON.parse(inner);
    } catch {
      continue;
    }
    const items = unwrapLd(data);
    for (const item of items) {
      const type = (item?.["@type"] ?? "").toString().toLowerCase();
      if (type !== "jobposting") continue;
      const parsed = parseSingleJobPosting(item);
      if (parsed.title) results.push(parsed);
    }
  }

  return results;
}

/** Return the FIRST JobPosting in the HTML, or undefined. */
export function extractJobPostingFromHtml(html: string): JobPostingJsonLd | undefined {
  return extractJobPostingsFromHtml(html)[0];
}

function unwrapLd(data: unknown): Array<Record<string, unknown>> {
  if (!data) return [];
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  const d = data as Record<string, unknown>;
  if (Array.isArray(d["@graph"])) return d["@graph"] as Array<Record<string, unknown>>;
  return [d];
}

function parseSingleJobPosting(item: Record<string, unknown>): JobPostingJsonLd {
  const jobLocations = Array.isArray(item.jobLocation)
    ? (item.jobLocation as unknown[])
    : item.jobLocation
      ? [item.jobLocation]
      : [];
  const primaryLocation = jobLocations[0] as Record<string, unknown> | undefined;
  const address = primaryLocation?.address as Record<string, unknown> | undefined;
  const city = stripHtml(address?.addressLocality) || undefined;
  const state = stripHtml(address?.addressRegion) || undefined;
  const country = stripHtml(address?.addressCountry) || undefined;
  const locationParts = [city, state, country].filter(Boolean);

  const jobLocationType = ((item.jobLocationType as string | undefined) ?? "").toString().toLowerCase();
  const titleText = stripHtml(item.title ?? "");
  const isRemote =
    jobLocationType.includes("telecommute") ||
    /\bremote\b/i.test(titleText) ||
    undefined;

  const employmentTypeRaw = Array.isArray(item.employmentType)
    ? (item.employmentType as unknown[])[0]
    : item.employmentType;
  const jobType = normalizeJsonLdEmploymentType(employmentTypeRaw);

  const baseSalary = item.baseSalary as Record<string, unknown> | undefined;
  const salaryMin = numericFromQuantitativeValue(baseSalary?.value, "minValue");
  const salaryMax = numericFromQuantitativeValue(baseSalary?.value, "maxValue");
  const salaryCurrency = stripHtml(baseSalary?.currency) || undefined;

  const skills = parseStringList(item.skills);
  const responsibilities = parseStringList(item.responsibilities);
  const qualifications = parseStringList(item.qualifications ?? item.educationRequirements);
  const requirements = parseStringList(item.requirements ?? item.experienceRequirements);
  const benefits = parseStringList(item.jobBenefits ?? item.benefits);

  const directApplyRaw = typeof item.directApply === "string" ? item.directApply.trim() : "";
  const canonicalRaw = typeof item.url === "string" ? (item.url as string).trim() : "";

  const org = item.hiringOrganization as Record<string, unknown> | undefined;
  const employmentUnit = item.employmentUnit as Record<string, unknown> | undefined;
  const companyName = stripHtml(
    (org?.name as string | undefined) ??
      (org?.legalName as string | undefined) ??
      (employmentUnit?.name as string | undefined) ??
      "",
  );

  return {
    title: titleText.slice(0, 250),
    description: typeof item.description === "string" ? (item.description as string) : undefined,
    company: companyName || undefined,
    location: locationParts.length > 0 ? locationParts.join(", ") : undefined,
    city,
    state,
    country,
    isRemote,
    jobType,
    salaryMin,
    salaryMax,
    salaryCurrency,
    skills: skills.length > 0 ? skills : undefined,
    responsibilities: responsibilities.length > 0 ? responsibilities : undefined,
    requirements: requirements.length > 0 ? requirements : undefined,
    qualifications: qualifications.length > 0 ? qualifications : undefined,
    benefits: benefits.length > 0 ? benefits : undefined,
    canonicalUrl: canonicalRaw || undefined,
    directApplyUrl: directApplyRaw || undefined,
    applyUrl: directApplyRaw || canonicalRaw || undefined,
  };
}

function numericFromQuantitativeValue(
  value: unknown,
  key: "minValue" | "maxValue" | "value",
): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = (value as Record<string, unknown>)[key];
  const n = typeof raw === "string" ? Number(raw) : (raw as number | undefined);
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => stripHtml(String(v))).filter((s) => s.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;\n\u2022\u00B7]/)
      .map((s) => stripHtml(s))
      .filter((s) => s.length > 0);
  }
  return [];
}

export function normalizeJsonLdEmploymentType(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.toUpperCase().replace(/[\s-]+/g, "_");
  const map: Record<string, string> = {
    FULL_TIME: "full_time",
    PART_TIME: "part_time",
    CONTRACTOR: "contract",
    CONTRACT: "contract",
    TEMPORARY: "temporary",
    INTERN: "internship",
    INTERNSHIP: "internship",
    VOLUNTEER: "volunteer",
    PER_DIEM: "per_diem",
    OTHER: "other",
  };
  return map[v] ?? undefined;
}
