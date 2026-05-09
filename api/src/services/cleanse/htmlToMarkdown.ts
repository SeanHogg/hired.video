// HTML → Markdown converter for job descriptions.
//
// Designed to run on Cloudflare Workers (no DOM, no Node primitives).
// Used by the job-body-cleanse worker to fix descriptions scraped as
// raw HTML. Kept deliberately small — handles the tag set seen in
// practice from job-board feeds and Greenhouse/Lever export markup.
//
// If the input doesn't look like HTML, returns it untouched.

const HTML_DETECT_RE = /<\s*(p|div|span|br|ul|ol|li|h[1-6]|strong|b|em|i|a|table|tr|td|th|tbody|thead|section|article)\b[^>]*>/i;

export interface CleanseResult {
  body: string;
  // Did the input look like HTML? When false, body === input.
  hadHtml: boolean;
  // Was the output different from the input? (independent of hadHtml —
  // some HTML inputs collapse to identical text, e.g. a single <p>x</p>.)
  changed: boolean;
}

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&copy;": "©",
  "&reg;": "®",
  "&trade;": "™",
  "&bull;": "•",
  "&middot;": "·",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&[a-z0-9#]+;/gi, (m) => ENTITY_MAP[m.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = parseInt(n, 16);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    });
}

function stripDangerous(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // Drop on*= event handlers and javascript: hrefs even though we'll strip
    // most attributes — defense in depth in case a tag is preserved.
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function extractAttr(tag: string, name: string): string | null {
  const re = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"|\\s${name}\\s*=\\s*'([^']*)'`, "i");
  const m = tag.match(re);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function htmlToMarkdownInner(html: string): string {
  let out = stripDangerous(html);

  // Normalize whitespace inside the source so block detection is reliable.
  out = out.replace(/\r\n?/g, "\n");

  // Headings — h1..h6 → "# " ... "###### "
  out = out.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_m, level, inner) => {
    const hashes = "#".repeat(parseInt(level, 10));
    return `\n\n${hashes} ${inner.trim()}\n\n`;
  });

  // Lists — convert <li> separately for ul vs ol so numbering is correct.
  out = out.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol\s*>/gi, (_m, inner) => {
    let i = 0;
    const body = inner.replace(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi, (_mm: string, item: string) => {
      i += 1;
      return `\n${i}. ${item.trim()}`;
    });
    return `\n${body}\n`;
  });
  out = out.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul\s*>/gi, (_m, inner) => {
    const body = inner.replace(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi, (_mm: string, item: string) => {
      return `\n- ${item.trim()}`;
    });
    return `\n${body}\n`;
  });
  // Stray <li> outside a list — treat as bullet.
  out = out.replace(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi, (_m, item) => `\n- ${item.trim()}`);

  // Anchors — <a href="X">text</a> → [text](X). Drop href if it's empty,
  // a fragment, or javascript: (already stripped above but double-check).
  out = out.replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, (_m, attrs: string, inner: string) => {
    const href = extractAttr(`<a${attrs}>`, "href");
    const text = inner.replace(/<[^>]+>/g, "").trim();
    if (!href || href.startsWith("#") || /^javascript:/i.test(href)) return text;
    return `[${text}](${href})`;
  });

  // Inline emphasis
  out = out
    .replace(/<\s*(strong|b)\b[^>]*>([\s\S]*?)<\/\s*\1\s*>/gi, (_m, _t, inner) => `**${inner.trim()}**`)
    .replace(/<\s*(em|i)\b[^>]*>([\s\S]*?)<\/\s*\1\s*>/gi, (_m, _t, inner) => `*${inner.trim()}*`)
    .replace(/<\s*code\b[^>]*>([\s\S]*?)<\/\s*code\s*>/gi, (_m, inner) => `\`${inner.trim()}\``);

  // Block-level breaks
  out = out
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n\n")
    .replace(/<\s*p\b[^>]*>/gi, "")
    .replace(/<\s*\/div\s*>/gi, "\n")
    .replace(/<\s*div\b[^>]*>/gi, "")
    .replace(/<\s*\/(section|article|header|footer|main|aside)\s*>/gi, "\n\n")
    .replace(/<\s*(section|article|header|footer|main|aside)\b[^>]*>/gi, "");

  // Strip every remaining tag (span, table, unknown). Table content is
  // preserved as plain text — markdown tables are rare in feed HTML and
  // would need column detection, which is not worth the complexity.
  out = out.replace(/<[^>]+>/g, "");

  out = decodeEntities(out);

  // Normalize whitespace: collapse runs of spaces/tabs, cap blank-line runs at 1.
  out = out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return out;
}

export function looksLikeHtml(input: string): boolean {
  return HTML_DETECT_RE.test(input);
}

export function cleanseDescription(input: string): CleanseResult {
  if (!input) return { body: input, hadHtml: false, changed: false };
  if (!looksLikeHtml(input)) {
    return { body: input, hadHtml: false, changed: false };
  }
  const cleaned = htmlToMarkdownInner(input);
  return { body: cleaned, hadHtml: true, changed: cleaned !== input };
}
