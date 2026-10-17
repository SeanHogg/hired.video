/** Pure string helpers shared by every OG SVG card. */
import { escapeXmlText } from "../../../../shared/course-cover.js";

export const escapeXml = escapeXmlText;

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Render the 5-star row as Unicode characters tuned to the average.
 *  Half-stars round up at >= 0.5. Used in the SVG body — CSS-styled
 *  half-fills are tricky in raw SVG and the Unicode ★/☆ render fine
 *  in social-card previews. */
export function renderStars(avg: number): string {
  const rounded = Math.round(avg);
  return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}

/** Word-wrap `text` into at most `maxLines` lines of roughly `maxChars`
 *  characters each, appending an ellipsis when it overflows. Pure string
 *  math — SVG <text> has no auto-wrap, so the marketing card lays the
 *  headline out by hand. */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  let consumed = 0;
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
      consumed++;
      if (lines.length === maxLines) break;
    } else {
      cur = cand;
      consumed++;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  // If words were dropped because we hit maxLines, mark the truncation.
  if (consumed < words.length && lines.length) {
    let last = lines[lines.length - 1].replace(/[.,;:\s]+$/, "");
    while (last.length > maxChars - 1 && last.includes(" ")) {
      last = last.slice(0, last.lastIndexOf(" "));
    }
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

/** Neutral two-line fallback card (private / missing entities) — social
 *  scrapers retry 404s forever, so they get this instead. */
export function genericCard(line1: string, line2: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#7c3aed"/>
        <stop offset="100%" stop-color="#2563eb"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    <text x="600" y="320" font-family="system-ui,sans-serif" font-size="60" font-weight="700"
          fill="white" text-anchor="middle">${escapeXml(line1)}</text>
    <text x="600" y="390" font-family="system-ui,sans-serif" font-size="28"
          fill="rgba(255,255,255,0.75)" text-anchor="middle">${escapeXml(line2)}</text>
  </svg>`;
}
