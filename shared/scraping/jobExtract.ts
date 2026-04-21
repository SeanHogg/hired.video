/**
 * DOM-based focused-pane job extraction. This is the "which job is the
 * user currently looking at?" problem — solved by the Chrome extension
 * on live pages, testable server-side with a jsdom document.
 *
 * DI design: every function takes a narrow `DomDocument` + `currentUrl`.
 * No globals, no `document`, no `window`. The extension wires these to
 * real browser objects; tests wire them to jsdom.
 */

import {
  FOCUSED_TITLE_SELECTORS,
  FOCUSED_COMPANY_SELECTORS,
  FOCUSED_LOCATION_SELECTORS,
  LINKEDIN_NOISE_HEADINGS,
  GOOGLE_JOBS_NOISE_HEADINGS,
  GENERIC_TITLE_NOISE,
} from "./siteConfigs.js";
import { canonicalizeJobUrl } from "./urls.js";

// Minimal structural typing — keeps this file buildable without the DOM
// type library, and lets tests pass in jsdom's shaped-like nodes.
interface DomElement {
  tagName: string;
  id?: string;
  textContent?: string | null;
  innerHTML?: string;
  outerHTML?: string;
  getAttribute(name: string): string | null;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  closest(selector: string): DomElement | null;
  parentElement?: DomElement | null;
  content?: string;
}

interface DomDocument {
  body: DomElement;
  title?: string;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  getElementById(id: string): DomElement | null;
}

export interface DetectedJob {
  title: string;
  company?: string;
  location?: string;
  /** The canonical job URL (LinkedIn `?currentJobId=` rewritten to `/jobs/view/`). */
  sourceUrl: string;
  /** Direct apply URL if discoverable — else same as sourceUrl. */
  applyUrl: string;
  /** Where in the pipeline did this result come from. */
  strategy: "jsonLd" | "focusedPane" | "linkedInFallback" | "generic";
  /** Extracted focused-pane HTML, if any — the extension uploads only
   *  this slice to avoid shipping the whole left-rail / search results. */
  focusedPaneHtml?: string;
}

function pickText(scope: DomElement, selectors?: string[]): string {
  if (!scope || !selectors) return "";
  for (const sel of selectors) {
    try {
      const el = scope.querySelector(sel);
      if (el && el.textContent) {
        const txt = el.textContent.replace(/\s+/g, " ").trim();
        if (txt) return txt;
      }
    } catch {
      // bad selector — keep trying
    }
  }
  return "";
}

function matchHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function inclHost(host: string, needle: string): boolean {
  return host.includes(needle);
}

// ---- Per-host focused-pane finders ----------------------------------------

function findLinkedInPane(doc: DomDocument): DomElement | null {
  const jobDetails = doc.getElementById("job-details");
  if (jobDetails) {
    const rightPane = jobDetails.closest(
      ".jobs-search__job-details, .jobs-details, .scaffold-layout__detail",
    );
    if (rightPane) return rightPane;

    let container: DomElement | null = jobDetails;
    for (let i = 0; i < 6 && container; i++) {
      if (container === doc.body) break;
      container = container.parentElement ?? null;
      if (!container) break;
      if (
        container.querySelector(
          ".job-card-container, .jobs-search-results-list, .scaffold-layout__list",
        )
      ) {
        break;
      }
      const len = (container.innerHTML || "").length;
      if (len > 3000 && len < 200_000) return container;
    }
    return jobDetails.parentElement ?? jobDetails;
  }

  const legacy =
    doc.querySelector(".jobs-search__job-details--container") ||
    doc.querySelector(".jobs-search__job-details") ||
    doc.querySelector(".job-view-layout") ||
    doc.querySelector(".top-card-layout");
  if (legacy) return legacy;

  const headings = Array.from(doc.querySelectorAll("h1, h2, h3, h4"));
  for (const h of headings) {
    const text = (h.textContent || "").trim().toLowerCase();
    if (text === "about the job" || text === "about this role") {
      let container: DomElement | null = h.parentElement ?? null;
      for (let i = 0; i < 10 && container; i++) {
        if (container === doc.body) break;
        const len = (container.innerHTML || "").length;
        if (len > 3000 && len < 200_000) return container;
        container = container.parentElement ?? null;
      }
    }
  }

  return null;
}

function findIndeedPane(doc: DomDocument): DomElement | null {
  return (
    doc.querySelector(".jobsearch-JobComponent") ||
    doc.querySelector("#viewJobSSRRoot") ||
    doc.querySelector(".jobsearch-ViewJobLayout--embedded") ||
    doc.querySelector(".jobsearch-RightPane") ||
    null
  );
}

function findGlassdoorPane(doc: DomDocument): DomElement | null {
  return (
    doc.querySelector('[class*="JobDetails_jobDetails"]') ||
    doc.querySelector(".JobDetails") ||
    doc.querySelector("#JDCol") ||
    null
  );
}

function findZipPane(doc: DomDocument): DomElement | null {
  return doc.querySelector(".job_details") || doc.querySelector("#job_desc") || null;
}

function findGooglePane(doc: DomDocument): DomElement | null {
  for (const h of Array.from(doc.querySelectorAll("h2, h3"))) {
    const txt = (h.textContent || "").trim().toLowerCase();
    if (txt === "job highlights" || txt === "full job description") {
      let el: DomElement | null = h;
      for (let i = 0; i < 12 && el; i++) {
        if (el === doc.body) break;
        el = el.parentElement ?? null;
        const len = el ? (el.innerHTML || "").length : 0;
        if (len > 3000 && len < 300_000) return el;
      }
    }
  }
  return null;
}

const FOCUSED_PANE_FINDERS: Record<string, (doc: DomDocument) => DomElement | null> = {
  "linkedin.com": findLinkedInPane,
  "indeed.com": findIndeedPane,
  "glassdoor.com": findGlassdoorPane,
  "ziprecruiter.com": findZipPane,
  "google.com": findGooglePane,
};

function findFocusedPane(doc: DomDocument, host: string): { el: DomElement; host: string } | null {
  for (const [pattern, finder] of Object.entries(FOCUSED_PANE_FINDERS)) {
    if (inclHost(host, pattern)) {
      try {
        const el = finder(doc);
        if (el) return { el, host: pattern };
      } catch {
        // ignore
      }
    }
  }
  return null;
}

// ---- Title pickers --------------------------------------------------------

function linkedInPickTitle(doc: DomDocument, paneEl: DomElement): string {
  if (!paneEl) return "";
  for (const sel of FOCUSED_TITLE_SELECTORS["linkedin.com"] ?? []) {
    try {
      const el = paneEl.querySelector(sel);
      if (el && el.textContent) {
        const txt = el.textContent.replace(/\s+/g, " ").trim();
        if (txt.length > 3 && !LINKEDIN_NOISE_HEADINGS.has(txt.toLowerCase())) return txt;
      }
    } catch {
      // ignore
    }
  }

  const activeCard =
    doc.querySelector(".job-card-container--clickable.job-card-list--is-current-job") ||
    doc.querySelector(".jobs-search-results__list-item--active") ||
    doc.querySelector('[class*="job-card"][class*="current"]');
  if (activeCard) {
    const cardTitle = activeCard.querySelector(
      '.job-card-list__title, [class*="job-card"] strong, a[class*="title"]',
    );
    if (cardTitle && cardTitle.textContent) {
      const txt = cardTitle.textContent.replace(/\s+/g, " ").trim();
      if (txt.length > 3) return txt;
    }
  }

  const dismissBtns = Array.from(doc.querySelectorAll('button[aria-label*="job"]'));
  for (const btn of dismissBtns) {
    const label = btn.getAttribute("aria-label") || "";
    const m = label.match(/^Dismiss\s+(.+?)\s+job$/i);
    if (m && m[1] && m[1].length > 3) return m[1];
  }

  const headings = Array.from(paneEl.querySelectorAll("h1, h2"));
  for (const h of headings) {
    const txt = (h.textContent || "").replace(/\s+/g, " ").trim();
    if (txt.length < 4 || txt.length > 200) continue;
    if (LINKEDIN_NOISE_HEADINGS.has(txt.toLowerCase())) continue;
    const lower = txt.toLowerCase();
    if (
      lower.startsWith("about ") ||
      lower.startsWith("how your") ||
      lower.startsWith("people ") ||
      lower.startsWith("benefits") ||
      lower.startsWith("skills")
    ) {
      continue;
    }
    return txt;
  }

  return "";
}

function googlePickTitle(paneEl: DomElement): string {
  if (!paneEl) return "";
  for (const h of Array.from(paneEl.querySelectorAll("h2"))) {
    const txt = (h.textContent || "").replace(/\s+/g, " ").trim();
    if (txt.length < 4 || txt.length > 300) continue;
    if (GOOGLE_JOBS_NOISE_HEADINGS.has(txt.toLowerCase())) continue;
    const lower = txt.toLowerCase();
    if (
      lower.startsWith("about ") ||
      lower.startsWith("how ") ||
      lower.startsWith("related ") ||
      lower.startsWith("people ") ||
      lower.startsWith("similar ")
    ) {
      continue;
    }
    return txt;
  }
  return "";
}

function googlePickCompanyLocation(paneEl: DomElement): { company?: string; location?: string } {
  if (!paneEl) return {};
  // Walk elements looking for the bullet-separated metadata line.
  const walkEls: DomElement[] = [];
  const stack: DomElement[] = [paneEl];
  while (stack.length && walkEls.length < 200) {
    const cur = stack.pop()!;
    walkEls.push(cur);
    const kids = Array.from((cur as unknown as { children?: ArrayLike<DomElement> }).children ?? []);
    for (const k of kids) stack.push(k);
  }
  for (const node of walkEls) {
    const text = (node.textContent || "").replace(/\s+/g, " ").trim();
    if (!text.includes("\u2022") || text.length < 5 || text.length > 300) continue;
    const kids = Array.from((node as unknown as { children?: ArrayLike<DomElement> }).children ?? []);
    if (kids.length > 10) continue;
    if ((node.innerHTML || "").length > 1000) continue;
    const parts = text.split("\u2022").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const filtered = parts.filter((p) => !p.toLowerCase().startsWith("via "));
      return {
        company: filtered[0] || undefined,
        location: filtered.length > 1 ? filtered.slice(1).join(", ") : undefined,
      };
    }
  }
  return {};
}

// ---- Apply URL (DOM-based shortcut) ---------------------------------------
//
// Note: the authoritative apply URL scorer lives in `applyLink.ts` (pure
// regex over HTML). This DOM-based helper is a fast-path for the extension
// when it's already holding a live document — selector priority is a
// simplified subset of the string scorer. For tests and server-side, use
// `scoreApplyCandidates` from applyLink.ts.

function domExtractApplyUrl(doc: DomDocument, currentUrl: string): string {
  const applySelectors = [
    "a[data-apply-url]",
    'a[href*="/apply"]',
    "a.apply-button",
    "a.apply-btn",
    'a[class*="apply" i]',
    'a[data-testid*="apply" i]',
    "button[data-apply-url]",
  ];

  for (const sel of applySelectors) {
    try {
      const els = Array.from(doc.querySelectorAll(sel));
      for (const el of els) {
        const href = el.getAttribute("href") || el.getAttribute("data-apply-url") || "";
        if (!href || href === "#" || href.startsWith("javascript:")) continue;
        try {
          const resolved = new URL(href, currentUrl).href;
          if (resolved.startsWith("http")) return resolved;
        } catch {
          // invalid URL
        }
      }
    } catch {
      // bad selector
    }
  }

  const li = doc.querySelector(".jobs-apply-button--top-card a[href]");
  if (li) {
    const href = li.getAttribute("href");
    if (href && href.startsWith("http")) return href;
  }

  return "";
}

// ---- Generic fallback -----------------------------------------------------

function genericExtract(doc: DomDocument, currentUrl: string): DetectedJob | null {
  let title = "";
  const h1 = doc.querySelector("h1");
  if (h1 && h1.textContent) {
    const txt = h1.textContent.replace(/\s+/g, " ").trim();
    if (txt.length > 3 && txt.length < 200 && !GENERIC_TITLE_NOISE.has(txt.toLowerCase())) {
      title = txt;
    }
  }

  if (!title) {
    const raw = (doc.title || "").replace(/\s+/g, " ").trim();
    if (raw) {
      const cleaned = raw
        .replace(
          /\s*[-|\u2013\u2014\u2022]\s*(Careers|Jobs|Hiring|Apply|Company|Recruit|Job Board|Openings).*$/i,
          "",
        )
        .trim();
      if (cleaned.length > 3 && cleaned.length < 200 && !GENERIC_TITLE_NOISE.has(cleaned.toLowerCase())) {
        title = cleaned;
      }
    }
  }

  if (!title) return null;

  let company = "";
  const og = doc.querySelector('meta[property="og:site_name"]');
  if (og) company = (og.getAttribute("content") || og.content || "").trim();

  let location = "";
  const locEl = doc.querySelector(
    '[data-testid*="location"], [class*="job-location"], [class*="jobLocation"]',
  );
  if (locEl && locEl.textContent) location = locEl.textContent.replace(/\s+/g, " ").trim();

  const sourceUrl = canonicalizeJobUrl(currentUrl);
  return {
    title: title.slice(0, 250),
    company: company || undefined,
    location: location || undefined,
    sourceUrl,
    applyUrl: domExtractApplyUrl(doc, currentUrl) || sourceUrl,
    strategy: "generic",
  };
}

// ---- Public entry points --------------------------------------------------

/**
 * Run the full DOM-based detection pipeline: JSON-LD → focused pane →
 * LinkedIn fallback → generic. Returns null if no job could be found.
 */
export function detectJobInPage(doc: DomDocument, currentUrl: string): DetectedJob | null {
  const host = matchHost(currentUrl);

  // 1. JSON-LD JobPosting — host-agnostic gold standard.
  const ldScripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  for (const script of ldScripts) {
    const textContent = script.textContent || "";
    if (!textContent.includes("JobPosting")) continue;
    try {
      const data = JSON.parse(textContent);
      const items = Array.isArray(data) ? data : (data && data["@graph"]) || [data];
      for (const item of items) {
        const type = (item?.["@type"] ?? "").toString().toLowerCase();
        if (type !== "jobposting") continue;
        const title = ((item.title as string | undefined) || "").toString().trim();
        if (!title) continue;
        const companyRaw = item.hiringOrganization?.name || item.hiringOrganization?.legalName || "";
        const company = companyRaw ? String(companyRaw).trim() : undefined;
        const loc = item.jobLocation?.address;
        const location = loc
          ? [loc.addressLocality, loc.addressRegion, loc.addressCountry].filter(Boolean).join(", ")
          : undefined;
        const directApply = typeof item.directApply === "string" ? item.directApply.trim() : "";
        const itemUrl = typeof item.url === "string" ? item.url.trim() : "";
        const sourceUrl = canonicalizeJobUrl(currentUrl);
        const applyUrl = directApply || itemUrl || domExtractApplyUrl(doc, currentUrl) || sourceUrl;
        return {
          title,
          company,
          location,
          sourceUrl,
          applyUrl,
          strategy: "jsonLd",
        };
      }
    } catch {
      // malformed JSON-LD — try next block
    }
  }

  // 2. Focused-pane detection
  const focused = findFocusedPane(doc, host);
  if (focused) {
    const titleFn: Record<string, (d: DomDocument, el: DomElement) => string> = {
      "linkedin.com": linkedInPickTitle,
      "google.com": (_d, el) => googlePickTitle(el),
    };
    const pickTitle = titleFn[focused.host] ?? ((_d: DomDocument, el: DomElement) => pickText(el, FOCUSED_TITLE_SELECTORS[focused.host]));
    const title = pickTitle(doc, focused.el);
    if (title) {
      let company: string | undefined;
      let location: string | undefined;
      if (focused.host === "google.com") {
        const meta = googlePickCompanyLocation(focused.el);
        company = meta.company;
        location = meta.location;
      } else {
        company = pickText(focused.el, FOCUSED_COMPANY_SELECTORS[focused.host]) || undefined;
        location = pickText(focused.el, FOCUSED_LOCATION_SELECTORS[focused.host]) || undefined;
      }
      const sourceUrl = canonicalizeJobUrl(currentUrl);
      return {
        title: title.slice(0, 250),
        company,
        location,
        sourceUrl,
        applyUrl: domExtractApplyUrl(doc, currentUrl) || sourceUrl,
        strategy: "focusedPane",
        focusedPaneHtml: focused.el.outerHTML,
      };
    }
  }

  // 3. LinkedIn-specific fallback — find the "About the job" anchor even
  //    when the focused-pane heuristics failed.
  if (inclHost(host, "linkedin.com")) {
    const title = linkedInPickTitle(doc, doc.body);
    if (title) {
      let paneEl: DomElement = doc.getElementById("job-details") ?? doc.body;
      let walkUp: DomElement | null = paneEl;
      for (let i = 0; i < 6 && walkUp; i++) {
        if (walkUp === doc.body) break;
        walkUp = walkUp.parentElement ?? null;
        if (walkUp && (walkUp.innerHTML || "").length > 3000) {
          paneEl = walkUp;
          break;
        }
      }
      const sourceUrl = canonicalizeJobUrl(currentUrl);
      return {
        title: title.slice(0, 250),
        sourceUrl,
        applyUrl: domExtractApplyUrl(doc, currentUrl) || sourceUrl,
        strategy: "linkedInFallback",
        focusedPaneHtml: paneEl.outerHTML,
      };
    }
  }

  // 4. Generic <h1>/title fallback
  return genericExtract(doc, currentUrl);
}
