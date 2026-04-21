/**
 * Apply-button URL extraction from raw HTML.
 *
 * Two modes:
 *   - `findApplyLinkInHtml(html, pageUrl)` — pure string scan, used by the
 *     API and in tests. Handles multiple candidate buttons by SCORING
 *     them and returning the best.
 *   - `scoreApplyCandidates(html, pageUrl)` — same scan but returns the
 *     ranked list (debug / tests / LLM bake-off).
 *
 * Scoring rules (higher wins):
 *   +100  href points at a known ATS domain (Workday, Greenhouse, Lever,
 *         Ashby, iCIMS, SmartRecruiters, Jobvite, BambooHR, Breezy,
 *         Recruitee, TeamTailor, Workable, SuccessFactors, Taleo, BrassRing)
 *   +30   href contains '/apply'
 *   +20   anchor text matches /apply\b/ (localized forms like "apply now",
 *         "apply here", "apply online", "apply today", "apply for")
 *   +15   anchor class/id contains 'apply'
 *   +10   anchor aria-label contains 'apply'
 *   -50   anchor text matches obvious non-apply patterns like "saved
 *         searches", "how to apply" (explainer, not a button)
 *   -200  href is an anchor (`#`), javascript: URL, or mailto:
 *
 * Threshold: the top-scoring candidate must clear >= 20 points, otherwise
 * `findApplyLinkInHtml` returns undefined. (Don't promote a random
 * `<a href="/apply-tips">` to the "Apply" CTA on a page where the real
 * button is a form submit.)
 */

export interface ApplyCandidate {
  href: string;
  score: number;
  reasons: string[];
  anchorText: string;
}

const ATS_DOMAIN_RE =
  /\b(?:myworkdayjobs\.com|workday\.com|greenhouse\.io|lever\.co|ashbyhq\.com|icims\.com|smartrecruiters\.com|jobvite\.com|bamboohr\.com|breezy\.hr|recruitee\.com|teamtailor\.com|workable\.com|successfactors\.com|taleo\.net|brassring\.com)\b/i;

const NEGATIVE_TEXT_PATTERNS = [
  /^how to apply/i,
  /saved (?:search|jobs?)/i,
  /applied jobs?/i,
  /your applications?/i,
  /^apply filters?/i,
  /^apply now to win/i,
];

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveHref(href: string, pageUrl?: string): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim();
  if (!trimmed || trimmed === "#") return undefined;
  if (trimmed.startsWith("javascript:") || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!pageUrl) return undefined;
  try {
    return new URL(trimmed, pageUrl).toString();
  } catch {
    return undefined;
  }
}

/** Scan raw HTML and return all apply-link candidates ranked by score. */
export function scoreApplyCandidates(html: string, pageUrl?: string): ApplyCandidate[] {
  if (!html) return [];

  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const buttonRe = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  const hrefRe = /href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i;
  const dataApplyRe = /data-apply-url\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i;
  const classRe = /class\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
  const idRe = /id\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
  const ariaRe = /aria-label\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

  const byHref = new Map<string, ApplyCandidate>();

  function consider(attrs: string, innerHtml: string) {
    const hrefM = hrefRe.exec(attrs);
    const dataM = dataApplyRe.exec(attrs);
    // data-apply-url is the authoritative signal from an integrator.
    // Try it first; fall back to href. This lets `<a data-apply-url="..."
    // href="#">Apply</a>` succeed even though the href alone is garbage.
    const dataHref = dataM?.[1] || dataM?.[2] || dataM?.[3];
    const plainHref = hrefM?.[1] || hrefM?.[2] || hrefM?.[3];
    const rawHref = dataHref || plainHref;
    if (!rawHref) return;
    const href = resolveHref(rawHref, pageUrl);
    if (!href) return;

    const text = stripTags(innerHtml).toLowerCase();
    const className = (classRe.exec(attrs)?.[1] || classRe.exec(attrs)?.[2] || "").toLowerCase();
    const idValue = (idRe.exec(attrs)?.[1] || idRe.exec(attrs)?.[2] || "").toLowerCase();
    const aria = (ariaRe.exec(attrs)?.[1] || ariaRe.exec(attrs)?.[2] || "").toLowerCase();

    let score = 0;
    const reasons: string[] = [];

    if (ATS_DOMAIN_RE.test(href)) {
      score += 100;
      reasons.push("ats-domain");
    }
    if (/\/apply\b/i.test(href)) {
      score += 30;
      reasons.push("href-apply");
    }
    if (/\bapply\b/.test(text) && !NEGATIVE_TEXT_PATTERNS.some((p) => p.test(text))) {
      score += 20;
      reasons.push("text-apply");
    }
    if (/\bapply\b/.test(className)) {
      score += 15;
      reasons.push("class-apply");
    }
    if (/\bapply\b/.test(idValue)) {
      score += 15;
      reasons.push("id-apply");
    }
    if (/\bapply\b/.test(aria)) {
      score += 10;
      reasons.push("aria-apply");
    }
    if (NEGATIVE_TEXT_PATTERNS.some((p) => p.test(text))) {
      score -= 50;
      reasons.push("negative-text");
    }

    if (score <= 0) return;

    const existing = byHref.get(href);
    if (!existing || score > existing.score) {
      byHref.set(href, { href, score, reasons, anchorText: stripTags(innerHtml).slice(0, 100) });
    }
  }

  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html)) !== null) {
    consider(match[1], match[2]);
  }
  while ((match = buttonRe.exec(html)) !== null) {
    consider(match[1], match[2]);
  }

  return Array.from(byHref.values()).sort((a, b) => b.score - a.score);
}

/**
 * Return the best apply link found in the HTML, or undefined if no
 * candidate cleared the 20-point threshold.
 */
export function findApplyLinkInHtml(html: string, pageUrl?: string): string | undefined {
  const ranked = scoreApplyCandidates(html, pageUrl);
  const top = ranked[0];
  if (!top) return undefined;
  if (top.score < 20) return undefined;
  return top.href;
}
