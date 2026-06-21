/**
 * Help content catalog — the single seam over the bundled Markdown files.
 *
 * Content of record lives in `frontend/content/help/<slug>.<locale>.md`
 * (one file per item per locale; `<slug>.en.md` is the fallback). The files
 * are bundled at build via `import.meta.glob` so reading help does ZERO DB
 * and ZERO network work — the content ships inside the app bundle as an
 * immutable, content-hashed asset and is parsed once in memory.
 *
 * Everything that shows help content (the AI Brain via useContextHelpItems,
 * /help, /help/:slug, card-feed, admin slug picker) reads through THIS module
 * — never the API (DRY; the API serves only mapping + search META, never
 * content).
 *
 * Localization: `getHelpItem(slug, locale)` returns the requested locale,
 * falling back to EN when that locale's file is absent.
 */

import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "@shared/i18n";
import { HELP_KINDS, type HelpKind } from "@shared/help";

export interface HelpItem {
  slug: string;
  kind: HelpKind;
  /** Resolved locale of this item (may be the EN fallback). */
  locale: Locale;
  title: string;
  summary: string;
  category: string;
  order: number;
  /** Markdown body. */
  body: string;
}

// Raw markdown, bundled. Keys are module paths; values are file contents.
const RAW = import.meta.glob("../../content/help/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

/** Minimal flat-YAML frontmatter parser — our frontmatter is flat
 *  `key: value` pairs only (no nesting/lists), so a full YAML lib is
 *  unwarranted. Returns the data map + the body below the fence. */
function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw.trim() };
  const data: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    val = val.replace(/^["']|["']$/g, "");
    if (key) data[key] = val;
  }
  return { data, body: m[2].trim() };
}

/** Parse a filename like `good-video-resume.fr-CA.md` → { slug, locale }.
 *  Locale is the final dotted segment before `.md`; slug is the rest (so
 *  hyphenated slugs survive). Returns null for an unsupported locale. */
function parseFilename(path: string): { slug: string; locale: Locale } | null {
  const base = path.split("/").pop()?.replace(/\.md$/, "");
  if (!base) return null;
  const dot = base.lastIndexOf(".");
  if (dot === -1) return null;
  const slug = base.slice(0, dot);
  const locale = normalizeLocale(base.slice(dot + 1));
  if (!slug || !locale) return null;
  return { slug, locale };
}

function isHelpKind(v: string): v is HelpKind {
  return (HELP_KINDS as readonly string[]).includes(v);
}

// slug → (locale → item). Built once at module load.
const CATALOG: Map<string, Map<Locale, HelpItem>> = (() => {
  const cat = new Map<string, Map<Locale, HelpItem>>();
  for (const [path, raw] of Object.entries(RAW)) {
    const fn = parseFilename(path);
    if (!fn) continue;
    const { data, body } = parseFrontmatter(raw);
    const kind = data.kind && isHelpKind(data.kind) ? data.kind : "faq";
    const item: HelpItem = {
      slug: data.slug || fn.slug,
      kind,
      locale: fn.locale,
      title: data.title ?? fn.slug,
      summary: data.summary ?? "",
      category: data.category ?? "General",
      order: Number.isFinite(Number(data.order)) ? Number(data.order) : 999,
      body,
    };
    const byLocale = cat.get(item.slug) ?? new Map<Locale, HelpItem>();
    byLocale.set(fn.locale, item);
    cat.set(item.slug, byLocale);
  }
  return cat;
})();

function resolveLocale(value: unknown): Locale {
  return normalizeLocale(value) ?? DEFAULT_LOCALE;
}

/** One item in the requested locale, falling back to EN, or null. */
export function getHelpItem(slug: string, locale: unknown = DEFAULT_LOCALE): HelpItem | null {
  const byLocale = CATALOG.get(slug);
  if (!byLocale) return null;
  const want = resolveLocale(locale);
  return byLocale.get(want) ?? byLocale.get(DEFAULT_LOCALE) ?? null;
}

/** All items resolved to a locale (EN fallback per item), optionally
 *  filtered by kind, sorted by (order, title). */
export function listHelpItems(
  locale: unknown = DEFAULT_LOCALE,
  opts: { kind?: HelpKind } = {},
): HelpItem[] {
  const out: HelpItem[] = [];
  for (const slug of CATALOG.keys()) {
    const item = getHelpItem(slug, locale);
    if (!item) continue;
    if (opts.kind && item.kind !== opts.kind) continue;
    out.push(item);
  }
  return out.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

/** Resolve an ordered slug list to items (locale-resolved, missing dropped).
 *  Used by the drawer to turn a context's curated slugs into cards. */
export function helpItemsForSlugs(slugs: string[], locale: unknown = DEFAULT_LOCALE): HelpItem[] {
  return slugs.map((s) => getHelpItem(s, locale)).filter((i): i is HelpItem => i !== null);
}

/** Common question words that carry no retrieval signal — dropped so a
 *  natural-language question ("how do I create a resume?") matches on its
 *  meaningful terms (create, resume) rather than the whole phrase. */
const STOPWORDS = new Set([
  "how", "do", "does", "did", "i", "a", "an", "the", "to", "my", "me", "we",
  "can", "is", "are", "be", "of", "in", "on", "at", "for", "from", "with",
  "and", "or", "you", "your", "it", "this", "that", "these", "those",
  "what", "where", "when", "why", "who", "which", "please", "help", "need",
  "want", "get", "got", "should", "would", "could", "if", "about", "as",
]);

/** Split a query into meaningful lowercased terms (alphanumeric, ≥2 chars,
 *  non-stopword). */
function tokenizeQuery(query: string): string[] {
  // Annotate the fallback as string[] — a bare `?? []` infers `never[]`, and
  // filtering the `RegExpMatchArray | never[]` union collapses the callback
  // param to `never` (TS2339 on `t.length`).
  const tokens: string[] = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return tokens.filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Client-side keyword search over the bundled corpus — instant, no DB.
 *  Tokenizes the query and scores each item by how many query terms appear
 *  in its title (×3) / summary (×2) / body (×1), so a phrased question
 *  ("how do I create a resume?") matches on its terms (create, resume)
 *  instead of requiring the exact phrase as a substring. Used by both the
 *  Help search box and the AI Brain's help-first retrieval. */
export function searchHelpLocal(
  query: string,
  locale: unknown = DEFAULT_LOCALE,
  limit = 12,
): HelpItem[] {
  if (query.trim().length < 2) return [];
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [];
  return listHelpItems(locale)
    .map((item) => {
      const title = item.title.toLowerCase();
      const summary = item.summary.toLowerCase();
      const body = item.body.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (title.includes(t)) score += 3;
        else if (summary.includes(t)) score += 2;
        else if (body.includes(t)) score += 1;
      }
      return { item, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.item.order - b.item.order)
    .slice(0, limit)
    .map((s) => s.item);
}

/** EN text per slug for semantic indexing — the client sends these to the
 *  reindex endpoint, which embeds + upserts vectors (text never persisted
 *  server-side). */
export function helpIndexItems(): Array<{ slug: string; text: string }> {
  const items: Array<{ slug: string; text: string }> = [];
  for (const slug of CATALOG.keys()) {
    const item = getHelpItem(slug, DEFAULT_LOCALE);
    if (!item) continue;
    items.push({ slug, text: [item.title, item.summary, item.body].filter(Boolean).join("\n") });
  }
  return items;
}

/** All known slugs (for the admin curation picker). */
export function helpSlugs(): string[] {
  return [...CATALOG.keys()].sort();
}
