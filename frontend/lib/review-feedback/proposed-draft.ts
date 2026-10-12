/**
 * A reviewer's full proposed draft (#2220): every line of the reviewed résumé
 * a reviewer can rewrite (the same lines the kit findings anchor to —
 * lib/build/line-locate.ts `textFields`), their edits applied to a copy, and
 * what changed vs the résumé as it is, line by line — shown before the
 * draft is sent with `POST /reviews/:id/propose`. Pure.
 */
import type { ResumeContent } from "@shared/resume";
import { normalizeText, readAt, writeAt, type ContentPath } from "@shared/resume-path";
import { textFields } from "@/lib/build/line-locate";
import type { ContentChange } from "@/lib/build/review/content-diff";

export interface DraftLine {
  path: ContentPath;
  /** Top-level section (`basics`, `work`, …) — groups the editor. */
  section: string;
  /** The entry the line belongs to ("VP Engineering · Acme"), "" for basics. */
  entry: string;
  /** Which field (`summary`, `highlights`, `label`, …). */
  field: string;
  text: string;
}

function entryLabel(content: ResumeContent, path: ContentPath): string {
  const [section, index] = path.split(".");
  const list = (content as Record<string, unknown>)[section];
  if (!Array.isArray(list) || index === undefined) return "";
  const e = (list[Number(index)] ?? {}) as Record<string, unknown>;
  return [e.position, e.name ?? e.organization].filter((v) => typeof v === "string" && v.trim()).join(" · ");
}

/** Every rewritable line, in reading order. */
export function draftLines(content: ResumeContent): DraftLine[] {
  return textFields(content).map((f) => ({
    path: f.path,
    section: f.section,
    entry: f.section === "basics" ? "" : entryLabel(content, f.path),
    field: f.field,
    text: f.text,
  }));
}

/** `content` with the reviewer's line edits written in (unchanged lines
 *  and every other field kept). Never mutates its input. */
export function applyDraftEdits(content: ResumeContent, edits: Readonly<Record<ContentPath, string>>): ResumeContent {
  let next = content;
  for (const [path, text] of Object.entries(edits)) next = writeAt(next, path, text);
  return next;
}

/**
 * What the draft changes, for the diff view; empty = nothing to send. The
 * reviewer edits lines in place, so each edited line is ONE change at its
 * path (before → after). A whole-document diff (content-diff.ts) matches
 * bullets by text and would show an edited bullet as a removal plus an
 * addition.
 */
export function draftChanges(content: ResumeContent, edits: Readonly<Record<ContentPath, string>>): ContentChange[] {
  const changes: ContentChange[] = [];
  for (const [path, after] of Object.entries(edits)) {
    const current = readAt(content, path);
    const before = typeof current === "string" ? current : "";
    if (normalizeText(before) === normalizeText(after)) continue;
    changes.push({
      id: path,
      path,
      section: path.split(".")[0],
      kind: !before.trim() ? "added" : !after.trim() ? "removed" : "changed",
      before,
      after,
    });
  }
  return changes;
}
