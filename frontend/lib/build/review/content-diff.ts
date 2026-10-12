/**
 * Content diff — what changed between two versions of a résumé, as
 * path-anchored changes (shared/resume-path.ts), and how to undo a chosen
 * subset of them.
 *
 * Used where a change list does not come from the server: a kit chat
 * revision (the model returns the whole revised résumé), a merge proposal
 * (marks what the other file adds), compare-only. Text is compared the
 * same way the merge engine and the merge bullet checklist compare it
 * (normalizeText), so "same bullet, different spacing" is not a change.
 *
 * Granularity: basics fields; entries matched by identity (company + role,
 * school + area, skill name…) not position; inside a matched entry, its
 * summary / description and each bullet. Pure.
 */
import type { ResumeContent } from "@shared/resume";
import { joinPath, normalizeText, readAt, writeAt, type ContentPath } from "@shared/resume-path";

export type ChangeKind = "added" | "removed" | "changed";

export interface ContentChange {
  /** Stable within one diff (`basics.label`, `work.2.highlights+…`). */
  id: string;
  /** Where the change is. Added / changed: a path in the AFTER document.
   *  Removed: the path of the entry it was removed from (or its section). */
  path: ContentPath;
  section: string;
  kind: ChangeKind;
  /** Text before / after (empty for an add / remove). */
  before: string;
  after: string;
  /** For a removed bullet / entry: what it was, to put it back. */
  removedValue?: unknown;
}

type Entry = Record<string, unknown>;

const BASICS_FIELDS = ["name", "label", "summary", "email", "phone", "url"] as const;
const ENTRY_TEXT_FIELDS = ["summary", "description"] as const;

/** Identity of an entry per section — how the same entry is found in both versions. */
const IDENTITY: Record<string, (e: Entry) => string> = {
  work: (e) => `${e.name ?? ""}|${e.position ?? ""}`,
  volunteer: (e) => `${e.organization ?? ""}|${e.position ?? ""}`,
  education: (e) => `${e.institution ?? ""}|${e.area ?? ""}|${e.studyType ?? ""}`,
  projects: (e) => String(e.name ?? ""),
  skills: (e) => String(e.name ?? ""),
  awards: (e) => String(e.title ?? ""),
  certificates: (e) => String(e.name ?? ""),
  publications: (e) => String(e.name ?? ""),
  languages: (e) => String(e.language ?? ""),
  interests: (e) => String(e.name ?? ""),
  references: (e) => String(e.name ?? ""),
};
export const DIFF_SECTIONS = Object.keys(IDENTITY);

const identity = (section: string, e: Entry) => normalizeText(IDENTITY[section]?.(e) ?? "");

/** One-line label of an entry for change lists ("VP Technology · AiM"). */
export function entryText(section: string, e: Entry): string {
  const parts = [e.position, e.name, e.organization, e.institution, e.title, e.language, e.studyType, e.area];
  const text = parts.filter((p): p is string => typeof p === "string" && !!p.trim()).join(" · ");
  if (section === "skills" && Array.isArray(e.keywords) && e.keywords.length) {
    return `${text}: ${(e.keywords as string[]).join(", ")}`;
  }
  return text;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** For each AFTER entry, the index of the same entry in BEFORE (or -1). */
export function matchEntries(section: string, before: Entry[], after: Entry[]): number[] {
  const used = new Set<number>();
  return after.map((a, i) => {
    const id = identity(section, a);
    let j = id ? before.findIndex((b, k) => !used.has(k) && identity(section, b) === id) : -1;
    if (j < 0 && i < before.length && !used.has(i) && (!id || !identity(section, before[i]))) j = i;
    if (j >= 0) used.add(j);
    return j;
  });
}

export function diffContent(before: ResumeContent, after: ResumeContent): ContentChange[] {
  const changes: ContentChange[] = [];
  for (const field of BASICS_FIELDS) {
    const b = str(before.basics?.[field]);
    const a = str(after.basics?.[field]);
    if (normalizeText(a) === normalizeText(b)) continue;
    const path = joinPath("basics", field);
    changes.push({ id: path, path, section: "basics", kind: !b ? "added" : !a ? "removed" : "changed", before: b, after: a });
  }
  for (const section of DIFF_SECTIONS) {
    const beforeList = ((before as Record<string, unknown>)[section] ?? []) as Entry[];
    const afterList = ((after as Record<string, unknown>)[section] ?? []) as Entry[];
    const matched = matchEntries(section, beforeList, afterList);
    afterList.forEach((entry, i) => {
      const path = joinPath(section, i);
      const j = matched[i];
      if (j < 0) {
        changes.push({ id: `${path}+`, path, section, kind: "added", before: "", after: entryText(section, entry) });
        return;
      }
      diffEntry(section, path, beforeList[j], entry, changes);
    });
    beforeList.forEach((entry, j) => {
      if (matched.includes(j)) return;
      changes.push({
        id: `${section}-${j}`,
        path: section,
        section,
        kind: "removed",
        before: entryText(section, entry),
        after: "",
        removedValue: entry,
      });
    });
  }
  return changes;
}

function diffEntry(section: string, path: string, before: Entry, after: Entry, out: ContentChange[]) {
  for (const field of ENTRY_TEXT_FIELDS) {
    const b = str(before[field]);
    const a = str(after[field]);
    if (normalizeText(a) === normalizeText(b)) continue;
    const p = joinPath(path, field);
    out.push({ id: p, path: p, section, kind: !b ? "added" : !a ? "removed" : "changed", before: b, after: a });
  }
  if (section === "skills") {
    const b = list(before.keywords).map(normalizeText).sort().join(",");
    const a = list(after.keywords).map(normalizeText).sort().join(",");
    if (a !== b) out.push({ id: path, path, section, kind: "changed", before: entryText(section, before), after: entryText(section, after) });
    return;
  }
  const beforeBullets = list(before.highlights);
  const afterBullets = list(after.highlights);
  const had = new Set(beforeBullets.map(normalizeText));
  const has = new Set(afterBullets.map(normalizeText));
  afterBullets.forEach((text, k) => {
    if (had.has(normalizeText(text))) return;
    const p = joinPath(path, "highlights", k);
    out.push({ id: p, path: p, section, kind: "added", before: "", after: text });
  });
  beforeBullets.forEach((text, k) => {
    if (has.has(normalizeText(text))) return;
    out.push({ id: `${path}-${k}`, path, section, kind: "removed", before: text, after: "", removedValue: text });
  });
}

/**
 * Undo `changes` (from `diffContent(baseline, …)` or a server change list)
 * on top of `current`. A field / whole-list path is restored from the
 * baseline; an added bullet / entry is taken out (matched by text /
 * identity, so it works on a draft edited since); a removed one is put
 * back at the end of its list.
 */
export function revertChanges(current: ResumeContent, baseline: ResumeContent, changes: readonly ContentChange[]): ResumeContent {
  let out = current;
  for (const c of changes) {
    const segs = c.path.split(".");
    const isBullet = segs.length === 4 && segs[2] === "highlights";
    const isEntry = segs.length === 2 && /^\d+$/.test(segs[1]);
    if (c.kind === "added" && isBullet) {
      const listPath = segs.slice(0, 3).join(".");
      out = writeAt(out, listPath, list(readAt(out, listPath)).filter((h) => normalizeText(h) !== normalizeText(c.after)));
    } else if (c.kind === "added" && isEntry) {
      const section = segs[0];
      const items = ((readAt(out, section) ?? []) as Entry[]).filter((e) => normalizeText(entryText(section, e)) !== normalizeText(c.after));
      out = writeAt(out, section, items);
    } else if (c.kind === "removed" && c.removedValue !== undefined) {
      const listPath = typeof c.removedValue === "string" ? `${c.path}.highlights` : c.path;
      const items = (readAt(out, listPath) ?? []) as unknown[];
      out = writeAt(out, listPath, [...items, c.removedValue]);
    } else {
      out = writeAt(out, c.path, readAt(baseline, c.path));
    }
  }
  return out;
}
