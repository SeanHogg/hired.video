/**
 * Inline edits on the résumé page (#1916 / #2101) — the canvas IS the form.
 *
 * The declarative renderer's inline-edit mode (components/resume-renderer/
 * inline-edit.tsx) makes the page's text editable where it is drawn. Every
 * edit comes back here as (content path, typed text) and is applied to the
 * ENTITY content — the JSON Resume document — by writing that one field
 * (shared/resume-path.ts `writeAt`, structural sharing). Nothing else in the
 * content changes: `metaData` (media bound to items) and `skillEvidence`
 * (skills bound to items) are never editable here and are carried over by
 * reference (#2153), so an inline edit can't wipe interactivity.
 *
 * Only an allow-listed field of an EXISTING entry is editable — an inline
 * edit never creates an entry or a bullet (adding rows is the section
 * editor's job), and a path into `metaData` / `skillEvidence` / ids is
 * refused.
 *
 * Pure: no I/O, never mutates its input.
 */
import { parsePath, readAt, writeAt, type ContentPath } from "@shared/resume-path";

/** Text fields of the résumé header (`basics.<field>`). */
const BASICS_FIELDS: ReadonlySet<string> = new Set(["name", "label", "email", "phone", "url", "summary"]);

/** Text fields of one entry, per array section. Dates are not here: the
 *  page shows them formatted ("Mar 2019"), so they edit in the section
 *  editor, where the stored form is typed. */
const ENTRY_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  work: new Set(["position", "name", "summary"]),
  volunteer: new Set(["position", "organization", "summary"]),
  education: new Set(["institution", "area", "studyType", "score"]),
  skills: new Set(["name", "level"]),
  languages: new Set(["language", "fluency"]),
  projects: new Set(["name", "description", "entity"]),
  awards: new Set(["title", "awarder", "summary"]),
  certificates: new Set(["name", "issuer"]),
  publications: new Set(["name", "publisher", "summary"]),
  interests: new Set(["name"]),
  references: new Set(["name", "reference"]),
};

/** Sections whose entries carry a `highlights` bullet list. */
const BULLET_SECTIONS: ReadonlySet<string> = new Set(["work", "volunteer", "projects"]);

/** Fields whose text keeps its line breaks (paragraphs); every other field
 *  is one line. */
const MULTILINE_FIELDS: ReadonlySet<string> = new Set(["summary", "description", "reference"]);

export interface InlineEditTarget {
  /** The text keeps line breaks (a paragraph) — otherwise one line. */
  multiline: boolean;
}

/** What the path points at, when it is an inline-editable text field — or
 *  null (an entry, a section, `metaData`, an id, an unknown field). Shape
 *  only: whether the entry exists is `applyInlineEdit`'s check. */
export function inlineEditTarget(path: ContentPath): InlineEditTarget | null {
  const segs = parsePath(path);
  const [section, second, third, fourth] = segs;
  if (section === "basics") {
    return segs.length === 2 && typeof second === "string" && BASICS_FIELDS.has(second)
      ? { multiline: MULTILINE_FIELDS.has(second) }
      : null;
  }
  if (typeof section !== "string" || typeof second !== "number") return null;
  const fields = ENTRY_FIELDS[section];
  if (!fields || typeof third !== "string") return null;
  if (segs.length === 3 && fields.has(third)) return { multiline: MULTILINE_FIELDS.has(third) };
  if (segs.length === 4 && third === "highlights" && BULLET_SECTIONS.has(section) && typeof fourth === "number") {
    return { multiline: false };
  }
  return null;
}

/** Typed text → the stored value: one-line fields collapse breaks and
 *  surrounding space; paragraphs keep their breaks, trimmed at the ends. */
export function normalizeInlineValue(target: InlineEditTarget, raw: string): string {
  const text = raw.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
  return target.multiline ? text.trim() : text.replace(/\s*\n\s*/g, " ").trim();
}

export type InlineEditRejection = "not-editable" | "missing-entry" | "not-text";

export type InlineEditResult<T> =
  | { ok: true; content: T; changed: boolean }
  | { ok: false; reason: InlineEditRejection };

/**
 * Write the typed text at `path`. Returns the SAME `content` object when the
 * value didn't change (no history step), otherwise a copy where only the
 * nodes along the path are new — every other section, `metaData` and
 * `skillEvidence` are the original references.
 */
export function applyInlineEdit<T extends object>(content: T, path: ContentPath, raw: string): InlineEditResult<T> {
  const target = inlineEditTarget(path);
  if (!target) return { ok: false, reason: "not-editable" };
  const segs = parsePath(path);
  // The entry (or bullet) must already exist — an inline edit never appends.
  if (segs[0] !== "basics") {
    const entry = readAt(content, `${segs[0]}.${segs[1]}`);
    if (!entry || typeof entry !== "object") return { ok: false, reason: "missing-entry" };
    if (segs.length === 4) {
      const bullets = (entry as { highlights?: unknown }).highlights;
      if (!Array.isArray(bullets) || (segs[3] as number) >= bullets.length) return { ok: false, reason: "missing-entry" };
    }
  }
  const current = readAt(content, path);
  if (current !== undefined && current !== null && typeof current !== "string") return { ok: false, reason: "not-text" };
  const next = normalizeInlineValue(target, raw);
  if ((current ?? "") === next) return { ok: true, content, changed: false };
  return { ok: true, content: writeAt(content, path, next), changed: true };
}
