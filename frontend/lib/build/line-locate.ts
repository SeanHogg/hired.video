/**
 * Where a quoted line sits on a résumé page — the text matching every
 * "this tool said X about that line" surface shares (page findings, the
 * "This line" inspector, a reviewer's suggested edit).
 *
 * Text matching folds case, whitespace, smart quotes and dashes, and accepts
 * a truncated quote ("…", "...") as a prefix of the line. Pure.
 */
import type { ResumeContent } from "@shared/resume";
import { readAt, type ContentPath } from "@shared/resume-path";

/** Shortest quote that may anchor a rewrite / an issue. */
export const MIN_REWRITE_QUOTE = 12;
const MIN_ISSUE_QUOTE = 6;

// ── Text matching ───────────────────────────────────────────────────────────

const FOLD: Readonly<Record<string, string>> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  " ": " ",
};

interface Normalised {
  text: string;
  /** Raw index of each normalised character. */
  at: number[];
}

/** Lowercase, fold quotes / dashes, collapse whitespace (trimmed), keeping
 *  a map back to the raw indices. */
function normalise(raw: string): Normalised {
  let text = "";
  const at: number[] = [];
  let pendingSpace = -1;
  for (let i = 0; i < raw.length; i++) {
    const ch = FOLD[raw[i]] ?? raw[i];
    if (/\s/.test(ch)) {
      if (text && pendingSpace < 0) pendingSpace = i;
      continue;
    }
    if (pendingSpace >= 0) {
      text += " ";
      at.push(pendingSpace);
      pendingSpace = -1;
    }
    for (const c of ch.toLowerCase()) {
      text += c;
      at.push(i);
    }
  }
  return { text, at };
}

const TRAILING_ELLIPSIS = /(?:…|\.{3})[)\]"'’”]*\s*$/;
const LEADING_GLYPHS = /^[\s\-•▪▸►◦‣*"'‘“]+/;
const TRAILING_PUNCT = /[\s.;,:!?"'’”]+$/;

interface Needle {
  text: string;
  truncated: boolean;
}

function toNeedle(quote: string): Needle {
  const truncated = TRAILING_ELLIPSIS.test(quote);
  const cleaned = quote.replace(TRAILING_ELLIPSIS, "").replace(LEADING_GLYPHS, "");
  return { text: normalise(cleaned).text.replace(TRAILING_PUNCT, ""), truncated };
}

export interface TextField {
  path: ContentPath;
  section: string;
  itemId?: string;
  field: string;
  text: string;
}

/** Every page text a finding can anchor to, in reading order (also the
 *  lines the "This line" inspector can select — lib/build/this-line.ts). */
export function textFields(content: ResumeContent): TextField[] {
  const out: TextField[] = [];
  const push = (path: ContentPath, section: string, field: string, text: string | undefined, itemId?: string) => {
    if (text && text.trim()) out.push({ path, section, field, text, itemId });
  };
  push("basics.label", "basics", "label", content.basics?.label);
  push("basics.summary", "basics", "summary", content.basics?.summary);
  const entries: Array<{ section: "work" | "volunteer" | "projects"; items: ReadonlyArray<{ id?: string; highlights?: string[] }>; prose: "summary" | "description" }> = [
    { section: "work", items: content.work ?? [], prose: "summary" },
    { section: "volunteer", items: content.volunteer ?? [], prose: "summary" },
    { section: "projects", items: content.projects ?? [], prose: "description" },
  ];
  for (const { section, items, prose } of entries) {
    items.forEach((item, i) => {
      const value = readAt(item, prose);
      push(`${section}.${i}.${prose}`, section, prose, typeof value === "string" ? value : undefined, item.id);
      item.highlights?.forEach((h, j) => push(`${section}.${i}.highlights.${j}`, section, "highlights", h, item.id));
    });
  }
  return out;
}

export interface Hit {
  field: TextField;
  start: number;
  end: number;
}

/** End of the sentence that contains raw index `from` (exclusive). */
function sentenceEnd(raw: string, from: number): number {
  const m = /[.!?](?=\s|$)/.exec(raw.slice(from));
  return m ? from + m.index + 1 : raw.length;
}

/** Where `quote` sits on the page: an exact line beats a line containing
 *  the quote, which beats a line the quote contains. Null when nowhere. */
export function locateQuote(content: ResumeContent, quote: string, minLength = MIN_ISSUE_QUOTE): Hit | null {
  const needle = toNeedle(quote);
  if (needle.text.length < minLength) return null;
  let best: { hit: Hit; rank: number } | null = null;
  for (const field of textFields(content)) {
    const norm = normalise(field.text);
    const whole = norm.text.replace(TRAILING_PUNCT, "");
    let rank = 0;
    let start = 0;
    let end = field.text.length;
    if (whole === needle.text) {
      rank = 3;
    } else {
      const pos = whole.indexOf(needle.text);
      if (pos >= 0) {
        rank = 2;
        start = norm.at[pos];
        end = norm.at[pos + needle.text.length - 1] + 1;
        if (needle.truncated) end = sentenceEnd(field.text, end);
        // Up to the line's own trailing punctuation → the whole line.
        if (start === norm.at[0] && !field.text.slice(end).replace(TRAILING_PUNCT, "")) {
          start = 0;
          end = field.text.length;
        }
      } else if (whole.length >= MIN_REWRITE_QUOTE && needle.text.includes(whole)) {
        rank = 1;
      }
    }
    if (rank > (best?.rank ?? 0)) best = { hit: { field, start, end }, rank };
    if (rank === 3) break;
  }
  return best?.hit ?? null;
}
