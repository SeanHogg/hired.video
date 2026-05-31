/**
 * Page harvester (#1830) — the client half of the SuperAdmin "turn this
 * page into a Studio video" flow.
 *
 * The AI Brain runs inside the page as an overlay, so `document` IS the
 * marketing page the operator is looking at. `harvestCurrentPage()` reads
 * the live DOM into the `HarvestedPage` wire shape that
 * `POST /api/studio/generate-from-page` consumes.
 *
 * This is the "hybrid" capture path (the operator's chosen design):
 * the CLIENT gathers visible text + images + CTAs + the app's own
 * PAGE_SEO positioning copy for the route; the SERVER then enriches with
 * route facts before prompting the model. Nothing here invents content —
 * it only reads what's on screen.
 */

import type {
  HarvestedCta,
  HarvestedImage,
  HarvestedPage,
  HarvestedSection,
} from "@shared/page-video-spec";
import { PAGE_SEO } from "@/lib/seo";
import { resolvePageSeoKey } from "@/lib/config/page-meta-registry";

/** Skip site chrome we never want in a promo video: nav, footer, the
 *  Brain overlay itself, cookie/consent banners, and the floating AI
 *  button. Harvest reads the main content region when one exists. */
const CHROME_SELECTOR =
  "nav, header, footer, [role='navigation'], [data-hired-embed], [data-ai-overlay], [aria-label='hired.video AI'], script, style, noscript";

/** Minimum natural dimension (px) for an image to count as content vs an
 *  icon/avatar/logo. Tuned to drop favicons + chip avatars while keeping
 *  hero art and screenshots. */
const MIN_IMAGE_DIM = 96;

function pickContentRoot(): HTMLElement {
  return (
    document.querySelector<HTMLElement>("main") ??
    document.querySelector<HTMLElement>("[role='main']") ??
    document.body
  );
}

function isInChrome(el: Element): boolean {
  return el.closest(CHROME_SELECTOR) != null;
}

function absoluteUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return null;
  }
  try {
    return new URL(trimmed, document.baseURI).href;
  } catch {
    return null;
  }
}

function harvestHeadings(root: HTMLElement): Array<{ level: number; text: string }> {
  const out: Array<{ level: number; text: string }> = [];
  root.querySelectorAll<HTMLElement>("h1, h2, h3").forEach((h) => {
    if (isInChrome(h)) return;
    const text = (h.textContent ?? "").trim().replace(/\s+/g, " ");
    if (text) out.push({ level: Number(h.tagName[1]), text: text.slice(0, 300) });
  });
  return out.slice(0, 60);
}

/** Anchor each h1–h3 to the readable copy that follows it (until the next
 *  heading of equal-or-higher rank). Gives the model the page's structure,
 *  not an undifferentiated text blob. */
function harvestSections(root: HTMLElement): HarvestedSection[] {
  const headings = Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3")).filter(
    (h) => !isInChrome(h),
  );
  const sections: HarvestedSection[] = [];
  for (const h of headings) {
    const level = Number(h.tagName[1]);
    const heading = (h.textContent ?? "").trim().replace(/\s+/g, " ");
    if (!heading) continue;
    const parts: string[] = [];
    let node: Element | null = h.nextElementSibling;
    while (node) {
      if (/^H[1-3]$/.test(node.tagName)) break;
      if (!isInChrome(node)) {
        const t = (node.textContent ?? "").trim().replace(/\s+/g, " ");
        if (t) parts.push(t);
      }
      node = node.nextElementSibling;
      if (parts.join(" ").length > 4000) break;
    }
    sections.push({
      level,
      heading: heading.slice(0, 300),
      text: parts.join(" ").slice(0, 4000),
    });
    if (sections.length >= 40) break;
  }
  return sections;
}

function harvestImages(root: HTMLElement): HarvestedImage[] {
  const seen = new Set<string>();
  const out: HarvestedImage[] = [];
  root.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    if (isInChrome(img) || out.length >= 50) return;
    const url = absoluteUrl(img.currentSrc || img.src);
    if (!url || seen.has(url)) return;
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    // Drop chrome-sized imagery (icons, avatars, logos) when we know the
    // dimensions; keep images whose size the browser hasn't resolved.
    if (w && h && (w < MIN_IMAGE_DIM || h < MIN_IMAGE_DIM)) return;
    seen.add(url);
    out.push({
      url,
      alt: (img.alt ?? "").trim().slice(0, 500),
      ...(w ? { width: w } : {}),
      ...(h ? { height: h } : {}),
    });
  });
  return out;
}

function harvestCtas(root: HTMLElement): HarvestedCta[] {
  const seen = new Set<string>();
  const out: HarvestedCta[] = [];
  const selector =
    "a[href], button, [role='button'], a.btn, a[class*='button' i]";
  root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    if (isInChrome(el) || out.length >= 20) return;
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
    if (!text || text.length > 60) return;
    const href =
      el instanceof HTMLAnchorElement ? absoluteUrl(el.getAttribute("href")) : null;
    const key = `${text}|${href ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ text: text.slice(0, 200), href: href ?? document.location.href });
  });
  return out;
}

function metaDescription(): string {
  const el = document.querySelector<HTMLMetaElement>("meta[name='description']");
  return (el?.content ?? "").trim().slice(0, 1000);
}

/**
 * Read the live page into a `HarvestedPage`. Returns `null` only in a
 * non-DOM context (SSR / tests) — callers should treat that as "can't
 * harvest here".
 */
export function harvestCurrentPage(): HarvestedPage | null {
  if (typeof document === "undefined") return null;

  const root = pickContentRoot();
  const pathname = document.location.pathname;

  // The app's own canonical positioning copy for this route — the most
  // authoritative one-liner we have, and exactly what SEO already trusts.
  const seoKey = resolvePageSeoKey(pathname);
  const seo = seoKey ? PAGE_SEO[seoKey] : undefined;

  const bodyText = (root.innerText ?? "").trim().replace(/\s+\n/g, "\n").slice(0, 20000);

  return {
    url: document.location.href,
    pathname,
    title: document.title.slice(0, 300),
    metaDescription: metaDescription(),
    headings: harvestHeadings(root),
    sections: harvestSections(root),
    images: harvestImages(root),
    ctas: harvestCtas(root),
    ...(seo?.title ? { seoTitle: seo.title.slice(0, 300) } : {}),
    ...(seo?.description ? { seoDescription: seo.description.slice(0, 1000) } : {}),
    bodyText,
  };
}
