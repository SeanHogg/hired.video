/**
 * Deterministic course-cover SVG — shared by the frontend "Auto-generate
 * cover" CTA ([frontend/lib/courses/cover-generator.ts]) and the worker-side
 * `GET /api/og/courses` endpoint ([api/src/routes/og.ts]).
 *
 * Why shared (#1400 follow-up): the seeded Learning Content Library
 * (migration 0131) ships every course with `cover_image_url = NULL`, so the
 * marketplace + /tools Learning grid fell back to a bare GraduationCap icon.
 * The client generator only fired when a creator clicked "Auto-generate",
 * which never happens for the system-owned seed library. The worker endpoint
 * lets migration 0190 backfill `cover_image_url` to a stable, edge-cacheable
 * URL — same SVG, same palette, same hash — without an asset-upload round
 * trip. Both surfaces MUST render byte-identical covers, so the palette +
 * hash + SVG body live here as the single source of truth.
 *
 * Pure: no DOM, no fetch, no Node/worker globals — safe to import from the
 * Vite frontend bundle AND the Cloudflare Worker.
 */

export const COURSE_COVER_PALETTES: Array<[string, string, string]> = [
  ["#1e3a8a", "#2563eb", "#60a5fa"], // blue
  ["#831843", "#db2777", "#f9a8d4"], // pink
  ["#064e3b", "#10b981", "#6ee7b7"], // emerald
  ["#78350f", "#f59e0b", "#fcd34d"], // amber
  ["#312e81", "#7c3aed", "#c4b5fd"], // violet
  ["#7c2d12", "#ea580c", "#fdba74"], // orange
  ["#1f2937", "#475569", "#94a3b8"], // slate
];

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickCoursePalette(seed: string): [string, string, string] {
  const idx = hash32(seed) % COURSE_COVER_PALETTES.length;
  return COURSE_COVER_PALETTES[idx]!;
}

/** XML-escape dynamic text before it lands in an SVG attribute or `<text>`
 *  body. Shared by every SVG renderer in this package (course covers +
 *  lesson diagrams) so an `&`/`<`/`>`/quote in a title or label can't
 *  produce invalid XML that an `<img>` renders as a broken image. */
export function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface CourseCoverInput {
  title: string;
  category?: string | null;
  difficulty?: string | null;
}

/** Render a 1200×630 SVG (Open Graph card size) cover as an SVG string. */
export function renderCourseCoverSvg({
  title,
  category,
  difficulty,
}: CourseCoverInput): string {
  const [dark, mid, light] = pickCoursePalette(`${title}|${category ?? ""}`);
  const safeTitle = escapeXmlText(title.slice(0, 120));
  const safeCategory = category ? escapeXmlText(category.slice(0, 40)) : "";
  const safeDifficulty = difficulty ? escapeXmlText(difficulty.slice(0, 20)) : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" role="img" aria-label="${safeTitle}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${dark}" />
      <stop offset="0.6" stop-color="${mid}" />
      <stop offset="1" stop-color="${light}" />
    </linearGradient>
    <pattern id="grid" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect width="1200" height="630" fill="url(#grid)" />
  <g transform="translate(80, 90)">
    <text x="0" y="0" fill="rgba(255,255,255,0.85)" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600" letter-spacing="6">
      ${safeCategory ? `${safeCategory.toUpperCase()} ${safeDifficulty ? ` · ${safeDifficulty.toUpperCase()}` : ""}` : "COURSE"}
    </text>
  </g>
  <g transform="translate(80, 300)">
    <text x="0" y="0" fill="white" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="72" font-weight="800">
      <tspan x="0" dy="0">${safeTitle.length > 38 ? safeTitle.slice(0, 38) : safeTitle}</tspan>
      ${safeTitle.length > 38 ? `<tspan x="0" dy="84">${safeTitle.slice(38, 76)}</tspan>` : ""}
    </text>
  </g>
  <g transform="translate(80, 540)">
    <rect x="0" y="0" width="80" height="6" fill="white" />
    <text x="100" y="0" dy="14" fill="white" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600">
      hired.video
    </text>
  </g>
</svg>`;
}
