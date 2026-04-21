/**
 * Pure HTML string operations shared by the API (Cloudflare Worker, no DOM)
 * and by the Chrome extension content scripts.
 *
 * Why pure string ops?
 *   - The API runs inside a Cloudflare Worker where there is no `document`
 *     or DOMParser, and pulling in cheerio/jsdom for these small
 *     transformations would blow up the bundle.
 *   - The extension can and does use `document` for live-page work, but
 *     when it ships a captured HTML snapshot to the backend or a worker,
 *     it re-uses exactly these helpers to stay byte-identical.
 *
 * Everything in this module is deterministic: same input ⇒ same output,
 * no side effects, no globals.
 */

export function stripHtml(text: unknown): string {
  if (typeof text !== "string") return "";
  return decodeHtmlEntities(
    text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&hellip;/g, "\u2026")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const n = parseInt(code, 16);
      return Number.isFinite(n) ? String.fromCharCode(n) : "";
    });
}

/**
 * HTML → Markdown-ish plain text. Preserves paragraph breaks, bullet
 * lists, headings, and bold section labels — all signals the LLM and
 * the section splitter rely on.
 */
export function htmlToMarkdown(input: unknown): string {
  if (typeof input !== "string" || !input) return "";

  let text = input;

  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  text = text.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => {
    const raw = String(inner);
    const t = raw.trim();
    if (!t) return "";
    if (/\n/.test(raw)) return `\n\n**${t}**\n\n`;
    return `**${t}**`;
  });
  text = text.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => {
    const t = String(inner).trim();
    return t ? `*${t}*` : "";
  });
  text = text.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");

  text = text.replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n");
  text = text.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n");
  text = text.replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n");
  text = text.replace(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi, "\n\n#### $1\n\n");
  text = text.replace(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi, "\n\n##### $1\n\n");
  text = text.replace(/<h6\b[^>]*>([\s\S]*?)<\/h6>/gi, "\n\n###### $1\n\n");
  text = text.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<p\b[^>]*>/gi, "");
  text = text.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1");
  text = text.replace(/<\/(ul|ol)>/gi, "\n\n");
  text = text.replace(/<(ul|ol)\b[^>]*>/gi, "\n");
  text = text.replace(/<\/(div|section|article|header|footer|main|aside)>/gi, "\n");
  text = text.replace(/<(div|section|article|header|footer|main|aside)\b[^>]*>/gi, "");

  text = text.replace(/<[^>]+>/g, "");
  text = decodeHtmlEntities(text);

  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

/**
 * Strip the heaviest noise from a captured page HTML blob before shipping
 * it to the backend: scripts (except JSON-LD structured data), styles,
 * comments, inline SVG, and analytics attributes. Used by the extension
 * before upload to cut payload from ~2MB to ~200KB on a typical LinkedIn
 * page.
 */
export function cleansePageHTML(html: string | null | undefined): string {
  if (!html || typeof html !== "string") return "";
  let out = html;
  out = out.replace(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    (m, attrs) => (/type\s*=\s*["']application\/ld\+json["']/i.test(attrs) ? m : ""),
  );
  out = out.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "");
  out = out.replace(
    /<link\b[^>]*rel\s*=\s*["'](?:stylesheet|preload|prefetch|dns-prefetch|preconnect)["'][^>]*>/gi,
    "",
  );
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "");
  out = out.replace(
    /\s(?:on[a-z]+|data-(?:analytics|tracking|gtm|adobe)[a-z-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
    "",
  );
  out = out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
  return out;
}
