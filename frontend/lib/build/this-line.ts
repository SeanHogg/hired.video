/**
 * The "This line" inspector's data, derived from the kit's selection
 * (KitLineRef, lib/workspace/kit/use-kit-line-selection.ts): which content
 * field the selected line is, the scoring findings pinned on it, and how it
 * relates to the target job (the job's keywords it shows, the ones it could
 * still cover).
 *
 * KitLineRef → field: the line's SCOPE is the section's text lines in page
 * reading order (page-findings' textFields: an entry's prose first —
 * work/volunteer `summary`, projects `description` — then its highlights;
 * basics: `label`, then `summary`). With `itemId` the scope is that entry's
 * lines only. `lineIndex` indexes the scope; `text` breaks ties — when the
 * indexed line no longer reads the same, an exact text match in the scope
 * wins. A line that is gone resolves to null (the inspector closes itself).
 *
 * Pure: no I/O, never mutates its input.
 */
import type { ResumeContent } from "@shared/resume";
import { entryPathOf, normalizeText, readAt, type ContentPath } from "@shared/resume-path";
import type { KitLineRef } from "@/lib/workspace/kit/use-kit-line-selection";
import { textFields, type PageFinding, type TextField } from "./page-findings";
import type { JobMatch } from "./job-match";

export interface ResolvedLine extends TextField {
  /** The entry's name on the page ("CIO", "Open-source CLI"), or null for
   *  a line outside an entry (the summary) or an unnamed entry. */
  itemTitle: string | null;
}

/** The selectable lines of `section` (one entry's when `itemId` is set). */
export function linesInScope(content: ResumeContent, section: string, itemId?: string): TextField[] {
  return textFields(content).filter(
    (f) => f.section === section && (itemId === undefined || f.itemId === itemId),
  );
}

/** Which field each section's entries are named by, in order of preference. */
const ITEM_TITLE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  work: ["position", "name"],
  volunteer: ["position", "organization"],
  projects: ["name"],
};

function itemTitleOf(content: ResumeContent, field: TextField): string | null {
  const entry = entryPathOf(field.path);
  const keys = ITEM_TITLE_FIELDS[field.section];
  if (!entry || !keys) return null;
  for (const key of keys) {
    const value = readAt(content, `${entry}.${key}`);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** The field the selected line is, or null when it is no longer on the page. */
export function resolveKitLine(content: ResumeContent | null, line: KitLineRef | null): ResolvedLine | null {
  if (!content || !line) return null;
  const scope = linesInScope(content, line.section, line.itemId);
  const indexed = scope[line.lineIndex];
  const wanted = normalizeText(line.text);
  const field =
    indexed && normalizeText(indexed.text) === wanted
      ? indexed
      : (scope.find((f) => normalizeText(f.text) === wanted) ?? indexed);
  return field ? { ...field, itemTitle: itemTitleOf(content, field) } : null;
}

/** The KitLineRef of the line at `path` (a finding's anchor, a page click),
 *  or null when `path` is not a selectable line. */
export function lineRefOfPath(content: ResumeContent, path: ContentPath): KitLineRef | null {
  const field = textFields(content).find((f) => f.path === path);
  if (!field) return null;
  const scope = linesInScope(content, field.section, field.itemId);
  const lineIndex = scope.findIndex((f) => f.path === path);
  return { section: field.section, itemId: field.itemId, lineIndex, text: field.text };
}

/** The findings pinned on this line (a missing-field finding never is). */
export function findingsForLine(findings: readonly PageFinding[], path: ContentPath): PageFinding[] {
  return findings.filter((f) => f.kind !== "missing" && f.anchor.path === path);
}

/** The finding's rewrites for this line, as wording suggestions. */
export function rewriteSuggestions(findings: readonly PageFinding[]): Array<{ id: string; text: string }> {
  return findings.flatMap((f) => (f.rewrite ? [{ id: f.id, text: f.rewrite.after }] : []));
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when the line mentions `keyword` as whole words (case / spacing folded). */
export function lineMentions(text: string, keyword: string): boolean {
  const needle = normalizeText(keyword);
  if (!needle) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}(?=$|[^\\p{L}\\p{N}])`, "u").test(normalizeText(text));
}

export interface LineKeywords {
  /** The job's keywords this line already shows. */
  matched: string[];
  /** Keywords the job asks for that the résumé still misses (and this
   *  line doesn't mention) — candidates to work into it. */
  missing: string[];
}

/** At most this many "could cover" keywords per line. */
export const MAX_LINE_MISSING = 6;

export function keywordsForLine(match: JobMatch | null, text: string): LineKeywords | null {
  if (!match) return null;
  const all = [...match.found, ...match.missing];
  const matched = all.filter((k, i) => lineMentions(text, k) && all.indexOf(k) === i);
  const missing = match.missing.filter((k) => !lineMentions(text, k)).slice(0, MAX_LINE_MISSING);
  return { matched, missing };
}
