/**
 * SVG social cards for DB-backed entities (company, résumé, voice listing,
 * creator). Each takes the (possibly null) repository row and returns an
 * OgImageResult; private/missing rows render a neutral card, never a 404 —
 * social scrapers retry 404s forever.
 */
import type { OgCompanyRow } from "../../repositories/ogPageEntityRepository.js";
import type { OgCreatorRow, OgResumeRow, OgVoiceRow } from "../../repositories/ogMediaRepository.js";
import type { OgImageResult } from "./og-entity-kind.js";
import { escapeXml, genericCard, renderStars, truncate } from "./svg-primitives.js";

const svg = (body: string, longCache: boolean): OgImageResult => ({ type: "svg", svg: body, longCache });

/** Company profile — surfaces the cached review_avg_overall + review_count
 *  (kept in sync by recomputeAggregateCache) without re-scanning reviews. */
export function renderCompanyCard(row: OgCompanyRow): OgImageResult {
  const name = row?.name ?? "Company";
  const tagline = row?.tagline ?? "";
  const avg = row?.reviewAvg ? Number(row.reviewAvg) : null;
  const count = row?.reviewCount ?? 0;

  const displayTitle = name.length > 50 ? name.slice(0, 47) + "…" : name;
  const displayTagline = tagline.length > 80 ? tagline.slice(0, 77) + "…" : tagline;
  const stars = avg !== null ? renderStars(avg) : "";
  const ratingLine =
    avg !== null && count > 0
      ? `${stars}  ${avg.toFixed(1)} · ${count} review${count === 1 ? "" : "s"}`
      : "No reviews yet";

  return svg(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="rgba(255,255,255,0.06)"/>

  <text x="100" y="200" font-family="system-ui,sans-serif" font-size="56" font-weight="700"
        fill="white">${escapeXml(displayTitle)}</text>

  ${displayTagline ? `<text x="100" y="270" font-family="system-ui,sans-serif" font-size="28"
        fill="rgba(255,255,255,0.75)">${escapeXml(displayTagline)}</text>` : ""}

  <text x="100" y="430" font-family="system-ui,sans-serif" font-size="44" fill="#fbbf24">${escapeXml(ratingLine)}</text>

  <text x="100" y="550" font-family="system-ui,sans-serif" font-size="22" fill="rgba(255,255,255,0.6)">hired.video</text>
</svg>`, false);
}

/** Résumé — candidate's title + owner name + headline. */
export function renderResumeCard(row: OgResumeRow): OgImageResult {
  const title = truncate(row?.title ?? "Resume", 60);
  const owner = truncate(row?.ownerName ?? "", 40);
  const headline = truncate(row?.headline ?? "", 70);

  return svg(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="rgba(255,255,255,0.06)"/>
  <text x="100" y="180" font-family="system-ui,sans-serif" font-size="28" fill="rgba(255,255,255,0.7)">Video Resume</text>
  <text x="100" y="270" font-family="system-ui,sans-serif" font-size="56" font-weight="700" fill="white">${escapeXml(title)}</text>
  ${owner ? `<text x="100" y="340" font-family="system-ui,sans-serif" font-size="32" fill="rgba(255,255,255,0.85)">${escapeXml(owner)}</text>` : ""}
  ${headline ? `<text x="100" y="395" font-family="system-ui,sans-serif" font-size="24" fill="rgba(255,255,255,0.65)">${escapeXml(headline)}</text>` : ""}
  <text x="100" y="550" font-family="system-ui,sans-serif" font-size="22" fill="rgba(255,255,255,0.6)">hired.video</text>
</svg>`, true);
}

/** Public voice-clone marketplace listing. */
export function renderVoiceCard(row: OgVoiceRow): OgImageResult {
  if (!row || row.visibility !== "public") {
    return svg(genericCard("Voice Marketplace", "hired.video"), false);
  }

  const name = truncate(row.name ?? "Voice", 50);
  const desc = truncate(row.description ?? "", 90);
  const meta = [row.language, row.gender].filter(Boolean).join(" · ");
  const price = row.priceCents != null ? `$${(row.priceCents / 100).toFixed(2)}` : "";

  return svg(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#06b6d4"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="rgba(255,255,255,0.08)"/>
  <!-- Mic glyph -->
  <g transform="translate(110,150)">
    <rect x="0" y="0" width="56" height="100" rx="28" fill="white" opacity="0.95"/>
    <rect x="-12" y="110" width="80" height="6" rx="3" fill="white" opacity="0.85"/>
    <rect x="22" y="120" width="12" height="32" fill="white" opacity="0.85"/>
  </g>
  <text x="200" y="220" font-family="system-ui,sans-serif" font-size="56" font-weight="700" fill="white">${escapeXml(name)}</text>
  ${desc ? `<text x="200" y="280" font-family="system-ui,sans-serif" font-size="26" fill="rgba(255,255,255,0.75)">${escapeXml(desc)}</text>` : ""}
  ${meta ? `<text x="200" y="340" font-family="system-ui,sans-serif" font-size="22" fill="rgba(255,255,255,0.6)">${escapeXml(meta)}</text>` : ""}
  ${price ? `<text x="100" y="500" font-family="system-ui,sans-serif" font-size="64" font-weight="700" fill="#fbbf24">${escapeXml(price)}</text>` : ""}
  <text x="100" y="560" font-family="system-ui,sans-serif" font-size="22" fill="rgba(255,255,255,0.6)">${escapeXml(`Voice clone by ${row.ownerName ?? "creator"} · hired.video`)}</text>
</svg>`, true);
}

/** Public creator profile. */
export function renderCreatorCard(row: OgCreatorRow): OgImageResult {
  if (!row || !row.isActive) {
    return svg(genericCard("Creator Marketplace", "hired.video"), false);
  }

  const name = truncate(row.displayName ?? row.ownerName ?? "Creator", 50);
  const tagline = truncate(row.tagline ?? "", 90);
  const avg = row.averageRating != null ? Number(row.averageRating) : null;
  const ratingLine =
    avg != null && avg > 0
      ? `${renderStars(avg)}  ${avg.toFixed(1)} · ${row.completedProjectsCount ?? 0} projects`
      : `${row.completedProjectsCount ?? 0} projects delivered`;

  return svg(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e3a8a"/>
      <stop offset="100%" stop-color="#db2777"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="rgba(255,255,255,0.06)"/>
  <text x="100" y="180" font-family="system-ui,sans-serif" font-size="28" fill="rgba(255,255,255,0.7)">Creator on hired.video</text>
  <text x="100" y="270" font-family="system-ui,sans-serif" font-size="56" font-weight="700" fill="white">${escapeXml(name)}</text>
  ${tagline ? `<text x="100" y="330" font-family="system-ui,sans-serif" font-size="26" fill="rgba(255,255,255,0.75)">${escapeXml(tagline)}</text>` : ""}
  <text x="100" y="430" font-family="system-ui,sans-serif" font-size="36" fill="#fbbf24">${escapeXml(ratingLine)}</text>
  <text x="100" y="550" font-family="system-ui,sans-serif" font-size="22" fill="rgba(255,255,255,0.6)">hired.video</text>
</svg>`, true);
}
