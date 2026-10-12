/**
 * Resume insights — deterministic, LLM-free read of a parsed resume.
 *
 * Powers the kit workspace: after a visitor uploads / pastes / describes
 * themselves we show "what we read" (industry, role, level, career pattern),
 * recommend a resume STRUCTURE, and rank the first-party resume templates.
 * Pure (no I/O, no React) so the frontend, tests, and any future API surface
 * share one rule set.
 *
 * Structure rules (documented decision):
 *   - steady        → chronological (latest role first; the classic reverse-
 *                     chronological resume recruiters scan fastest)
 *   - pivot         → hybrid (summary + transferable skills up top, then work)
 *   - gaps (> 9 mo) → functional (skills lead, work history kept brief)
 *   - early-career  → hybrid with EDUCATION FIRST. A purely functional resume
 *                     reads as "hiding something" to recruiters; a new grad has
 *                     nothing to hide, they just have little work history, so
 *                     education + skills lead and the (short) work list follows.
 *
 * `reasons` are i18n KEYS (flat dotted, `build.reason.*`), never English, so
 * every surface renders them through `t()`.
 */
import type { ResumeContent } from "./resume.js";
import type { MarketplaceTemplateListing } from "./marketplace-template-listings.js";

// ─── Vocabulary ──────────────────────────────────────────────────────────

/** Industry labels — byte-identical to `RESUME_TEMPLATE_LISTINGS[].industry`
 *  so a detected industry matches a template listing directly. */
export const RESUME_INDUSTRIES = [
  "Software / Engineering",
  "Healthcare / Clinical",
  "Finance / Payroll",
  "Sales / Business Development",
  "Creative / Product",
  "Executive / C-Suite",
  "Intern / New Grad",
  "Hospitality / Retail",
  "Risk / Consulting",
  "Film / Theatre / Television",
  "Film / Television",
] as const;
export type ResumeIndustry = (typeof RESUME_INDUSTRIES)[number];

export const SENIORITY_LEVELS = ["entry", "mid", "senior", "executive"] as const;
export type Seniority = (typeof SENIORITY_LEVELS)[number];

export const CAREER_PATTERNS = ["steady", "pivot", "gaps", "early-career"] as const;
export type CareerPattern = (typeof CAREER_PATTERNS)[number];

export const RESUME_STRUCTURES = ["chronological", "hybrid", "functional"] as const;
export type ResumeStructure = (typeof RESUME_STRUCTURES)[number];

/** Things we can detect as worth fixing. `count` is set when it is a tally. */
export type ResumeFlagId =
  | "missing-end-date"
  | "missing-summary"
  | "no-metrics"
  | "missing-email";

export interface ResumeFlag {
  id: ResumeFlagId;
  /** i18n key for the flag's one-line description. */
  labelKey: string;
  count?: number;
}

export interface ResumeInsights {
  industry: ResumeIndustry | null;
  roleFamily: string | null;
  seniority: Seniority;
  /** Total years of (de-overlapped) work, one decimal. */
  yearsExperience: number;
  pattern: CareerPattern;
  /** Longest gap BETWEEN dated roles — the fact behind "gaps" (null when
   *  the dated roles are continuous). */
  longestGap: CareerGap | null;
  /** Roles whose start date couldn't be read. They can't be placed on the
   *  timeline, so while any exist a gap is never claimed as a career break. */
  undatedRoles: number;
  recommendedStructure: ResumeStructure;
  /** True when education should lead (early-career). */
  educationFirst: boolean;
  /** i18n keys explaining the recommendation. */
  reasons: string[];
  flags: ResumeFlag[];
}

/** A stretch with no dated role. `from`/`to` are the first and last months
 *  of the gap, as "YYYY-MM". */
export interface CareerGap {
  from: string;
  to: string;
  months: number;
}

export interface AnalyzeOptions {
  /** Injectable clock — "Present" / missing end dates resolve to this. */
  now?: Date;
}

// ─── Dates ───────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const PRESENT_RE = /^(present|current|now|today|ongoing|actual|actuel|aujourd'hui)$/i;

/** True when an end date means "still here" (blank or a Present-like word). */
export function isOpenEndDate(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return v === "" || PRESENT_RE.test(v);
}

/**
 * Parse a resume date into an absolute month index (`year * 12 + month`).
 * Tolerates "2016", "2021-03", "2021-03-15", "03/2021", "Mar 2021",
 * "March 2021". `edge` decides where a year-only value lands: "start" → Jan,
 * "end" → Dec (so "2016 – 2018" spans the whole of both years).
 * Returns null for blank / unparseable input.
 */
export function parseResumeMonth(
  value: string | null | undefined,
  edge: "start" | "end" = "start",
): number | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  let m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?/.exec(v);
  if (m) return Number(m[1]) * 12 + clampMonth(Number(m[2]) - 1);
  m = /^(\d{1,2})\/(\d{4})$/.exec(v);
  if (m) return Number(m[2]) * 12 + clampMonth(Number(m[1]) - 1);
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{4})$/i.exec(v);
  if (m && MONTHS[m[1].toLowerCase()] !== undefined) {
    return Number(m[2]) * 12 + MONTHS[m[1].toLowerCase()];
  }
  m = /^(\d{4})$/.exec(v);
  if (m) return Number(m[1]) * 12 + (edge === "start" ? 0 : 11);
  return null;
}

function clampMonth(n: number): number {
  return Math.min(11, Math.max(0, Number.isFinite(n) ? n : 0));
}

interface Interval {
  start: number;
  end: number;
}

type WorkLike = NonNullable<ResumeContent["work"]>[number];

function workInterval(w: WorkLike, nowMonth: number): Interval | null {
  const start = parseResumeMonth(w.startDate, "start");
  if (start === null) return null;
  const end = isOpenEndDate(w.endDate) ? nowMonth : parseResumeMonth(w.endDate, "end");
  if (end === null || end < start) return { start, end: start };
  return { start, end: Math.min(end, Math.max(nowMonth, start)) };
}

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end + 1) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  }
  return out;
}

/** A gap between roles longer than this many months reads as a career break. */
export const CAREER_BREAK_MONTHS = 9;

/** "YYYY-MM" for an absolute month index (`year * 12 + month`). */
export function formatResumeMonth(index: number): string {
  const year = Math.floor(index / 12);
  return `${year}-${String(index - year * 12 + 1).padStart(2, "0")}`;
}

/** Longest gap BETWEEN roles (career breaks; not time since the last role
 *  ended). */
function longestGap(merged: Interval[]): CareerGap | null {
  let best: CareerGap | null = null;
  for (let i = 1; i < merged.length; i++) {
    const months = merged[i].start - merged[i - 1].end - 1;
    if (months > 0 && (!best || months > best.months)) {
      best = {
        from: formatResumeMonth(merged[i - 1].end + 1),
        to: formatResumeMonth(merged[i].start - 1),
        months,
      };
    }
  }
  return best;
}

// ─── Industry / seniority classification ─────────────────────────────────

/** Ordered keyword table — earlier entries win ties. Keywords match at a word
 *  start (prefix: "engineer" matches "engineering"); ≤ 3-char tokens must
 *  match as a whole word ("rn", "vp", "ux"). */
const INDUSTRY_KEYWORDS: ReadonlyArray<[ResumeIndustry, readonly string[]]> = [
  ["Film / Theatre / Television", ["actor", "actress", "theatre", "theater", "stage manager", "performer", "casting", "voice actor"]],
  ["Film / Television", ["film", "filmmaker", "cinematograph", "screenwrit", "documentar", "television", "tv", "showrunner", "post-production"]],
  ["Healthcare / Clinical", ["nurse", "nursing", "rn", "lpn", "physician", "clinical", "clinic", "patient", "hospital", "medical", "therapist", "pharmac", "dental", "paramedic", "emt", "caregiver"]],
  ["Software / Engineering", ["software", "developer", "engineer", "devops", "sre", "frontend", "front-end", "backend", "back-end", "full stack", "full-stack", "programmer", "data scientist", "machine learning", "typescript", "javascript", "python", "kubernetes", "react"]],
  ["Creative / Product", ["designer", "design", "ux", "ui", "product manager", "product owner", "creative", "art director", "copywriter", "illustrator", "figma", "brand"]],
  ["Sales / Business Development", ["sales", "account executive", "sdr", "bdr", "business development", "account manager", "quota", "partnerships"]],
  ["Finance / Payroll", ["accountant", "accounting", "payroll", "finance", "financial", "bookkeep", "cpa", "controller", "accounts payable", "accounts receivable", "treasury"]],
  ["Risk / Consulting", ["consultant", "consulting", "risk", "compliance", "audit", "advisory", "governance"]],
  ["Hospitality / Retail", ["server", "bartender", "barista", "hotel", "hospitality", "retail", "cashier", "store manager", "restaurant", "chef", "cook", "front desk", "guest", "customer service"]],
];

const EXEC_TITLE_RE =
  /\b(chief|ceo|cto|cfo|coo|cmo|cio|cpo|ciso|president|vice president|vp|svp|evp|founder|co-founder|managing director|general manager)\b/i;
const SENIOR_TITLE_RE = /\b(senior|sr\.?|lead|principal|staff|head of|director|manager)\b/i;
const ENTRY_TITLE_RE = /\b(intern|internship|junior|jr\.?|trainee|apprentice|student|entry[- ]level)\b/i;
const STUDENT_TITLE_RE = /\b(intern|internship|student|new grad)\b/i;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const COMPILED_INDUSTRY: ReadonlyArray<[ResumeIndustry, RegExp[]]> = INDUSTRY_KEYWORDS.map(
  ([industry, kws]) => [
    industry,
    kws.map((kw) => new RegExp(`(?:^|[^a-z])${escapeRe(kw)}${kw.length <= 3 ? "(?![a-z])" : ""}`, "i")),
  ],
);

function scoreText(text: string, weight: number, scores: Map<ResumeIndustry, number>): void {
  if (!text) return;
  for (const [industry, res] of COMPILED_INDUSTRY) {
    const hits = res.filter((re) => re.test(text)).length;
    if (hits > 0) scores.set(industry, (scores.get(industry) ?? 0) + hits * weight);
  }
}

function bestIndustry(scores: Map<ResumeIndustry, number>, threshold: number): ResumeIndustry | null {
  let best: ResumeIndustry | null = null;
  let bestScore = 0;
  // Iterate in table order so ties resolve deterministically to the earlier row.
  for (const [industry] of COMPILED_INDUSTRY) {
    const s = scores.get(industry) ?? 0;
    if (s > bestScore) {
      best = industry;
      bestScore = s;
    }
  }
  return bestScore >= threshold ? best : null;
}

/** Industry of a single job title (used for pivot detection). */
function titleIndustry(title: string): ResumeIndustry | null {
  const scores = new Map<ResumeIndustry, number>();
  scoreText(title, 1, scores);
  return bestIndustry(scores, 1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Work entries newest-first (by start date; undated entries keep their
 *  authored order, which is newest-first in practically every resume). */
function workNewestFirst(content: ResumeContent): WorkLike[] {
  const work = (content.work ?? []).filter((w) => (w.position ?? "").trim() || (w.name ?? "").trim());
  return work
    .map((w, i) => ({ w, i, start: parseResumeMonth(w.startDate, "start") }))
    .sort((a, b) => {
      if (a.start !== null && b.start !== null && a.start !== b.start) return b.start - a.start;
      return a.i - b.i;
    })
    .map((x) => x.w);
}

const UNIT_METRIC_RE = /(\d+(?:[.,]\d+)?\s?(?:%|x\b|k\b|m\b|b\b|percent)|[$€£]\s?\d)/i;
const PLAIN_NUMBER_RE = /\b\d{2,}(?:,\d{3})*\b/g;
const YEAR_RE = /^(19[5-9]\d|20\d\d)$/;

/** True when a bullet carries a measurable result (%, $, 3x, 40k, 120 …).
 *  Bare calendar years ("since 2019") don't count. */
export function isQuantified(text: string): boolean {
  if (UNIT_METRIC_RE.test(text)) return true;
  return (text.match(PLAIN_NUMBER_RE) ?? []).some((n) => !YEAR_RE.test(n));
}

const YEARS_TEXT_RE = /(\d{1,2})\+?\s*(?:years|yrs|ans|años)\b/gi;

/** "8 years in health-tech" → 8. Used only when no role carries dates (a
 *  resume described in a prompt). Largest plausible mention wins. */
export function yearsMentioned(text: string): number | null {
  let best: number | null = null;
  for (const m of text.matchAll(YEARS_TEXT_RE)) {
    const n = Number(m[1]);
    if (n > 0 && n < 60 && (best === null || n > best)) best = n;
  }
  return best;
}

// ─── Public API ──────────────────────────────────────────────────────────

export function analyzeResume(content: ResumeContent, opts: AnalyzeOptions = {}): ResumeInsights {
  const now = opts.now ?? new Date();
  const nowMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const work = workNewestFirst(content);
  const latest = work[0];
  const latestTitle = (latest?.position ?? "").trim();
  const label = (content.basics?.label ?? "").trim();
  const headline = latestTitle || label;

  // Years of experience — de-overlapped union of dated roles.
  const intervals = work
    .map((w) => workInterval(w, nowMonth))
    .filter((iv): iv is Interval => iv !== null);
  const merged = mergeIntervals(intervals);
  const undatedRoles = work.length - intervals.length;
  const months = merged.reduce((sum, iv) => sum + (iv.end - iv.start + 1), 0);
  const statedYears =
    intervals.length === 0
      ? yearsMentioned(`${label} ${content.basics?.summary ?? ""} ${latest?.summary ?? ""}`)
      : null;
  const yearsExperience = statedYears ?? Math.round((months / 12) * 10) / 10;
  const yearsKnown = intervals.length > 0 || statedYears !== null;

  // Seniority — title first (it's the strongest signal), then years.
  let seniority: Seniority;
  if (EXEC_TITLE_RE.test(headline)) seniority = "executive";
  else if (ENTRY_TITLE_RE.test(headline)) seniority = "entry";
  else if (SENIOR_TITLE_RE.test(headline)) seniority = "senior";
  else if (!yearsKnown) seniority = "mid";
  else if (yearsExperience < 2) seniority = "entry";
  else if (yearsExperience < 7) seniority = "mid";
  else seniority = "senior";

  // Pattern.
  const hasEducation = (content.education ?? []).some((e) => (e.institution ?? "").trim());
  const isStudent = STUDENT_TITLE_RE.test(headline);
  const earlyCareer =
    isStudent || (work.length === 0 && hasEducation) || (yearsKnown && yearsExperience < 2);
  const latestIndustry = latestTitle ? titleIndustry(latestTitle) : null;
  const earlierIndustries = work.slice(1).map((w) => titleIndustry(w.position ?? ""));
  const earlierDominant = dominant(earlierIndustries);
  const pivot =
    latestIndustry !== null && earlierDominant !== null && latestIndustry !== earlierDominant;
  const gap = longestGap(merged);
  // Only claim a break the data proves: an undated role may fill the gap.
  const gaps = undatedRoles === 0 && (gap?.months ?? 0) > CAREER_BREAK_MONTHS;
  const pattern: CareerPattern = earlyCareer
    ? "early-career"
    : gaps
      ? "gaps"
      : pivot
        ? "pivot"
        : "steady";

  // Industry — weighted keyword scoring (titles dominate, latest most).
  let industry: ResumeIndustry | null;
  if (EXEC_TITLE_RE.test(headline)) {
    industry = "Executive / C-Suite";
  } else if (isStudent || (work.length === 0 && hasEducation)) {
    industry = "Intern / New Grad";
  } else {
    const scores = new Map<ResumeIndustry, number>();
    scoreText(latestTitle, 4, scores);
    scoreText(label, 3, scores);
    work.slice(1, 3).forEach((w) => scoreText(w.position ?? "", 2, scores));
    work.slice(0, 2).forEach((w) => scoreText(w.summary ?? "", 1, scores));
    scoreText(content.basics?.summary ?? "", 1, scores);
    scoreText((content.skills ?? []).map((s) => s.name ?? "").join(", "), 1, scores);
    industry = bestIndustry(scores, 2);
  }

  const recommendedStructure: ResumeStructure =
    pattern === "steady" ? "chronological" : pattern === "gaps" ? "functional" : "hybrid";

  const reasons: string[] = [`build.reason.${patternKey(pattern)}`];
  if (industry) reasons.push("build.reason.industryMatch");
  if (seniority === "executive") reasons.push("build.reason.executive");

  return {
    industry,
    roleFamily: headline || null,
    seniority,
    yearsExperience,
    pattern,
    longestGap: gap,
    undatedRoles,
    recommendedStructure,
    educationFirst: pattern === "early-career",
    reasons,
    flags: detectResumeFlags(content),
  };
}

function patternKey(p: CareerPattern): string {
  return p === "early-career" ? "earlyCareer" : p;
}

function dominant(list: Array<ResumeIndustry | null>): ResumeIndustry | null {
  const counts = new Map<ResumeIndustry, number>();
  for (const i of list) if (i) counts.set(i, (counts.get(i) ?? 0) + 1);
  let best: ResumeIndustry | null = null;
  let n = 0;
  for (const [i, c] of counts) {
    if (c > n) {
      best = i;
      n = c;
    }
  }
  return best;
}

/**
 * Detectable issues worth a nudge. Only flags what the data proves:
 *   - missing-end-date: a role that is NOT the most recent has no end date
 *     (reads as two concurrent current jobs).
 *   - missing-summary: no professional summary.
 *   - no-metrics: there are bullets, but none carries a number.
 *   - missing-email: no contact email.
 */
export function detectResumeFlags(content: ResumeContent): ResumeFlag[] {
  const flags: ResumeFlag[] = [];
  const work = workNewestFirst(content);
  const openOlder = work.slice(1).filter((w) => !(w.endDate ?? "").trim()).length;
  if (openOlder > 0) {
    flags.push({ id: "missing-end-date", labelKey: "build.flag.missingEndDate", count: openOlder });
  }
  if (!(content.basics?.summary ?? "").trim()) {
    flags.push({ id: "missing-summary", labelKey: "build.flag.missingSummary" });
  }
  const bullets = work.flatMap((w) => w.highlights ?? []).filter((h) => h.trim());
  if (bullets.length > 0 && !bullets.some(isQuantified)) {
    flags.push({ id: "no-metrics", labelKey: "build.flag.noMetrics" });
  }
  if (!(content.basics?.email ?? "").trim()) {
    flags.push({ id: "missing-email", labelKey: "build.flag.missingEmail" });
  }
  return flags;
}

/**
 * Rank resume template listings for these insights, best first. Scoring:
 *   +100 exact industry match
 *   +80  seniority hint (executive → Executive template, early-career → New Grad)
 *   +60  hired-default (always near the top — the signature hero layout)
 * Ties keep the listings' authored order. Returns slugs.
 */
export function rankTemplates(
  insights: Pick<ResumeInsights, "industry" | "seniority" | "pattern">,
  listings: readonly MarketplaceTemplateListing[],
): string[] {
  const scored = listings.map((l, index) => {
    let score = 0;
    if (insights.industry && l.industry === insights.industry) score += 100;
    if (insights.seniority === "executive" && l.industry === "Executive / C-Suite") score += 80;
    if (insights.pattern === "early-career" && l.industry === "Intern / New Grad") score += 80;
    if (l.slug === "hired-default") score += 60;
    return { slug: l.slug, score, index };
  });
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((s) => s.slug);
}
