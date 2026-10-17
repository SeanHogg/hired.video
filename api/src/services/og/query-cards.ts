/**
 * Query-param-driven OG cards (no DB): the generic marketing `/page` card,
 * `/blog`, `/articles` and `/courses` covers. Each takes the raw query
 * values (undefined when absent) and returns the SVG body.
 */
import { renderCourseCoverSvg } from "../../../../shared/course-cover.js";
import { escapeXml, truncate, wrapText } from "./svg-primitives.js";

type Q = string | undefined;

/** `/page` — generic branded card for any marketing / app route. */
export function buildPageCardSvg(q: { title: Q; eyebrow: Q; subtitle: Q }): string {
  const title = truncate((q.title || "hired.video").trim(), 90);
  const eyebrow = truncate((q.eyebrow || "").trim(), 30).toUpperCase();
  const subtitle = truncate((q.subtitle || "").trim(), 130);
  return renderPageCard({ title, eyebrow, subtitle });
}

/** `/blog` — blog posts live in the front-end registry, not the DB. */
export function buildBlogCardSvg(q: { title: Q; category: Q; date: Q; author: Q }): string {
  const title = truncate(q.title || "hired.video Blog", 60);
  const category = truncate(q.category || "", 40);
  const date = truncate(q.date || "", 30);
  const author = truncate(q.author || "Sean Hogg", 30);

  const dateLine = [category, date].filter(Boolean).join(" · ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="rgba(255,255,255,0.06)"/>
  <text x="100" y="170" font-family="system-ui,sans-serif" font-size="24" fill="rgba(255,255,255,0.6)">hired.video Blog</text>
  <text x="100" y="270" font-family="system-ui,sans-serif" font-size="56" font-weight="700" fill="white">${escapeXml(title)}</text>
  ${dateLine ? `<text x="100" y="340" font-family="system-ui,sans-serif" font-size="26" fill="rgba(255,255,255,0.7)">${escapeXml(dateLine)}</text>` : ""}
  <text x="100" y="540" font-family="system-ui,sans-serif" font-size="24" fill="rgba(255,255,255,0.65)">by ${escapeXml(author)}</text>
  <text x="100" y="580" font-family="system-ui,sans-serif" font-size="20" fill="rgba(255,255,255,0.5)">hired.video/blog</text>
</svg>`;
}

/** `/articles` — fallback cover for articles without a cover_image_url. */
export function buildArticlesCardSvg(q: { title: Q; category: Q; date: Q; author: Q }): string {
  const title = truncate(q.title || "hired.video Articles", 70);
  const category = truncate(q.category || "", 40);
  const date = truncate(q.date || "", 30);
  const author = truncate(q.author || "hired.video Editorial", 40);

  const metaLine = [category, date].filter(Boolean).join(" · ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="rgba(255,255,255,0.06)"/>
  <text x="100" y="170" font-family="system-ui,sans-serif" font-size="24" fill="rgba(255,255,255,0.6)">hired.video Articles</text>
  <text x="100" y="270" font-family="system-ui,sans-serif" font-size="52" font-weight="700" fill="white">${escapeXml(title)}</text>
  ${metaLine ? `<text x="100" y="340" font-family="system-ui,sans-serif" font-size="26" fill="rgba(255,255,255,0.7)">${escapeXml(metaLine)}</text>` : ""}
  <text x="100" y="540" font-family="system-ui,sans-serif" font-size="24" fill="rgba(255,255,255,0.65)">by ${escapeXml(author)}</text>
  <text x="100" y="580" font-family="system-ui,sans-serif" font-size="20" fill="rgba(255,255,255,0.5)">hired.video/articles</text>
</svg>`;
}

/** `/courses` — deterministic course cover via the shared renderer, so a
 *  server-rendered cover is byte-identical to a client-generated one. */
export function buildCourseCoverSvg(q: { title: Q; category: Q; difficulty: Q }): string {
  const title = (q.title || "Course").slice(0, 120);
  const category = q.category || null;
  const difficulty = q.difficulty || null;
  return renderCourseCoverSvg({ title, category, difficulty });
}

/** Branded marketing share card (1200×630) — brand gradient + eyebrow tag +
 *  wrapped headline + optional subtitle + footer. Mirrors the hand-designed
 *  public/og-image.svg palette (#7c3aed→#3b82f6) so the generated per-page
 *  cards sit in the same brand family as the home hero. */
function renderPageCard(opts: { title: string; eyebrow: string; subtitle: string }): string {
  const titleLines = wrapText(opts.title, 26, 3);
  const fontSize = titleLines.length >= 3 ? 50 : titleLines.length === 2 ? 58 : 66;
  const lineHeight = fontSize + 12;
  // Center the title block vertically, biased up to leave room for the
  // subtitle + footer. `startY` is the baseline of the first line.
  const startY = 320 - ((titleLines.length - 1) * lineHeight) / 2;
  const titleSvg = titleLines
    .map(
      (line, i) =>
        `<text x="100" y="${startY + i * lineHeight}" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="${fontSize}" font-weight="800" fill="white" letter-spacing="-1">${escapeXml(line)}</text>`,
    )
    .join("\n  ");
  const subtitleY = startY + (titleLines.length - 1) * lineHeight + 64;
  const subtitleSvg = opts.subtitle
    ? `<text x="100" y="${subtitleY}" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="26" font-weight="400" fill="white" opacity="0.78">${escapeXml(opts.subtitle)}</text>`
    : "";
  const eyebrowSvg = opts.eyebrow
    ? `<text x="100" y="150" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="24" font-weight="700" fill="#a5b4fc" letter-spacing="2">${escapeXml(opts.eyebrow)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="50%" stop-color="#6d28d9"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1050" cy="120" r="180" fill="white" opacity="0.05"/>
  <circle cx="150" cy="540" r="120" fill="white" opacity="0.05"/>
  <!-- Brand glyph (video camera, matches favicon) -->
  <g transform="translate(100, 70) scale(1.6)" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.9">
    <rect x="2" y="6" width="14" height="12" rx="2"/>
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/>
  </g>
  ${eyebrowSvg}
  ${titleSvg}
  ${subtitleSvg}
  <rect x="0" y="588" width="1200" height="42" fill="black" opacity="0.18"/>
  <text x="100" y="616" font-family="system-ui,sans-serif" font-size="22" font-weight="600" fill="white" opacity="0.85">hired.video</text>
  <text x="1100" y="616" font-family="system-ui,sans-serif" font-size="20" fill="white" opacity="0.6" text-anchor="end">AI video resumes &amp; career tools</text>
</svg>`;
}
