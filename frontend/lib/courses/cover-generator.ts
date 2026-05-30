/**
 * Deterministic course-cover SVG generator (#1400).
 *
 * The seeded learning library inserted with migration
 * `0131_seed_platform_learning_library.sql` ships every course with
 * `cover_image_url = NULL`, so the marketplace falls back to the
 * GraduationCap icon for the AI Fundamentals / RAG / Prompt Engineering /
 * Must-Have Skills / Claude API courses. A creator authoring a new course
 * is in the same spot until they grab a stock photo.
 *
 * Approach: render an SVG-based cover with the course title + a
 * gradient picked deterministically from the title hash. Output is a
 * Blob the caller can upload via the existing `/api/upload/single`
 * flow → returns the public R2 URL that `coverImageUrl` accepts. No
 * server-side image library, no cost.
 *
 * Why SVG and not canvas/raster: text stays crisp at every breakpoint
 * the course card uses, the rendered file is ~2KB (cheap CDN-cache
 * hit), and SVG is the universal social-card format LinkedIn / Slack /
 * X unfurl bots already understand. If a future redesign needs a
 * raster cover, the SVG can be rendered into a canvas at upload time.
 */

import { apiClient } from "@/lib/api-client";

const PALETTES: Array<[string, string, string]> = [
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

function pickPalette(seed: string): [string, string, string] {
  const idx = hash32(seed) % PALETTES.length;
  return PALETTES[idx]!;
}

function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render a 1200×630 SVG (Open Graph card size) cover and return it as
 *  a Blob suitable for the existing single-upload route. */
export function renderCoverSvg({
  title,
  category,
  difficulty,
}: {
  title: string;
  category?: string | null;
  difficulty?: string | null;
}): Blob {
  const [dark, mid, light] = pickPalette(`${title}|${category ?? ""}`);
  const safeTitle = escapeXmlText(title.slice(0, 120));
  const safeCategory = category ? escapeXmlText(category.slice(0, 40)) : "";
  const safeDifficulty = difficulty ? escapeXmlText(difficulty.slice(0, 20)) : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" role="img" aria-label="${safeTitle}">
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

  return new Blob([svg], { type: "image/svg+xml" });
}

/** Build the cover and upload it to R2 via the existing single-file
 *  route. Returns the public URL ready to drop into
 *  `courses.cover_image_url`. */
export async function generateAndUploadCover(input: {
  courseId: string;
  title: string;
  category?: string | null;
  difficulty?: string | null;
}): Promise<string> {
  const blob = renderCoverSvg(input);
  const file = new File([blob], `course-${input.courseId}-cover.svg`, { type: "image/svg+xml" });
  const form = new FormData();
  form.append("file", file);
  form.append("kind", "course_cover");
  const res = await apiClient.post<{ url: string; key: string }>(
    "/api/upload/single",
    form,
  );
  return res.data.url;
}
