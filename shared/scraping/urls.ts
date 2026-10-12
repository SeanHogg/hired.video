/**
 * URL normalization, canonicalization, and job-site detection.
 *
 * Pure string ops — no network, no DOM. Used by:
 *   - API (`POST /api/jobs/extract`, dedup pipeline)
 *   - Chrome extension content script (before sending jobDetected payload)
 *   - Frontend (deep-link rewriting)
 */

/**
 * Tracking params that major job sites append to URLs. Stripping them
 * gives a stable canonical URL that survives re-clicks, shared links,
 * and different entry points to the same listing.
 */
export const TRACKING_PARAMS = new Set([
  // LinkedIn
  "refid",
  "trackingid",
  "trk",
  "midtoken",
  "midsig",
  "ref",
  "currentjobid",
  "ebotoken",
  "start",
  // Indeed
  "vjk",
  "advn",
  "adid",
  "from",
  "fromage",
  "fccid",
  "tk",
  // Google / UTM
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  // Glassdoor
  "clicksource",
  "src",
  "ao",
  // Generic social/ads
  "fbclid",
  "gclid",
  "li_fat_id",
  "mc_cid",
  "mc_eid",
]);

/**
 * Strip tracking params and trailing hash from a job-page URL.
 * Returns the input unchanged if it can't be parsed as a URL.
 */
export function normalizeJobUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    const params = new URLSearchParams();
    for (const [key, value] of u.searchParams) {
      if (!TRACKING_PARAMS.has(key.toLowerCase())) {
        params.set(key, value);
      }
    }
    u.search = params.toString();
    u.hash = "";
    return u.toString();
  } catch {
    return raw ?? undefined;
  }
}

/**
 * Rewrite a job URL into its canonical detail-page form.
 *
 * Currently handles LinkedIn: a collections/search URL with
 * `?currentJobId=12345` is rewritten to
 * `https://www.linkedin.com/jobs/view/12345/`. Returns the input URL
 * unchanged for all other hosts.
 *
 * This is the dedup key the extension uses when firing jobDetected —
 * without it, the same job viewed from `/jobs/collections/recommended`
 * vs `/jobs/view/12345` shows up as two different jobs in the side panel.
 */
export function canonicalizeJobUrl(raw: string): string {
  if (!raw) return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  const host = url.hostname.toLowerCase();

  if (host.includes("linkedin.com")) {
    const jobId = url.searchParams.get("currentJobId");
    if (jobId) {
      return `https://www.linkedin.com/jobs/view/${jobId}/`;
    }
    const viewMatch = url.pathname.match(/\/jobs\/view\/(\d+)/);
    if (viewMatch) {
      return `https://www.linkedin.com/jobs/view/${viewMatch[1]}/`;
    }
  }

  return raw;
}

/**
 * Applicant Tracking System URL patterns — used to detect the ATS of a
 * page the user is on. Matters because ATS pages (Workday, Greenhouse,
 * etc.) have well-known form structures the extension can autofill, and
 * because the API prefers linking to the ATS URL over the aggregator URL
 * when both are available.
 */
export const ATS_URL_PATTERNS: Record<string, RegExp> = {
  greenhouse: /boards\.greenhouse\.io|\.greenhouse\.io/i,
  lever: /jobs\.lever\.co/i,
  workday: /\.myworkdayjobs\.com|\.myworkdaysite\.com/i,
  ashby: /jobs\.ashbyhq\.com/i,
  smartrecruiters: /jobs\.smartrecruiters\.com/i,
  icims: /\.icims\.com/i,
  bamboohr: /\.bamboohr\.com\/careers/i,
};

/**
 * Return the ATS provider slug that matches the given URL, or null. Case-
 * insensitive; anchors to the URL as a whole rather than to individual
 * segments so partial matches (e.g. `/greenhouse.io/tracking-pixel`) don't
 * false-positive.
 */
export function detectAtsProvider(url: string | null | undefined): string | null {
  if (!url) return null;
  for (const [provider, pattern] of Object.entries(ATS_URL_PATTERNS)) {
    if (pattern.test(url)) return provider;
  }
  return null;
}

/** Major aggregator job boards — distinct from ATS providers. */
export const JOB_BOARD_HOST_PATTERNS: Record<string, RegExp> = {
  linkedin: /(^|\.)linkedin\.com$/i,
  indeed: /(^|\.)indeed\.com$/i,
  glassdoor: /(^|\.)glassdoor\.com$/i,
  ziprecruiter: /(^|\.)ziprecruiter\.com$/i,
  google: /(^|\.)google\.com$/i,
  monster: /(^|\.)monster\.com$/i,
  dice: /(^|\.)dice\.com$/i,
  amazon: /(^|\.)amazon\.jobs$/i,
};

export function detectJobBoard(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [name, pattern] of Object.entries(JOB_BOARD_HOST_PATTERNS)) {
    if (pattern.test(host)) return name;
  }
  return null;
}

/**
 * Does this URL look like a job listing page (as opposed to the user's
 * home feed, a company page, or a profile)? Heuristic — used to skip
 * job-detection work on pages where it's obviously pointless.
 *
 * Returns false for obvious non-job URLs (feed, inbox, settings). Returns
 * true otherwise — the heavier extraction still gates on finding actual
 * job content.
 */
export function looksLikeJobUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();

  // Never treat hired.video's own pages as a job — the extension tracks
  // jobs INTO hired.video, not out of it.
  const OWN_HOSTS = new Set(["hired.video", "www.hired.video", "localhost", "127.0.0.1"]);
  if (OWN_HOSTS.has(host)) return false;

  if (detectAtsProvider(url)) return true;
  if (detectJobBoard(url)) {
    // Aggregators have non-job pages too — specifically exclude them.
    const nonJobPatterns = [
      /^\/feed\//,
      /^\/in\//,
      /^\/mynetwork/,
      /^\/messaging/,
      /^\/notifications/,
      /^\/company\/[^/]+\/?$/,
    ];
    if (nonJobPatterns.some((p) => p.test(path))) return false;
    // Amazon Jobs: only /jobs/{id}/{slug} is a real listing.
    // /content/... and /en/teams etc. are recruiter-marketing landing pages —
    // the generic <h1> fallback would otherwise false-positive them
    // ("Artificial Intelligence" landing page → fake job titled "Artificial Intelligence").
    if (host.endsWith("amazon.jobs")) return /\/jobs\/\d+(\/|$)/.test(path);
    // Major boards put job URLs under many paths: LinkedIn /jobs/view/,
    // Indeed /viewjob, Glassdoor /Job/, ZipRecruiter /jobs/, etc.
    if (/(jobs?|viewjob|career)/i.test(path)) return true;
    // Google — look for the `ibp=htl;jobs` search fragment
    if (host.includes("google.com") && parsed.search.includes("ibp=htl;jobs")) return true;
    return false;
  }

  // Generic careers pages on company sites.
  return /(jobs?|careers?|hiring|opening|position|roles?|vacanc)/i.test(path);
}
