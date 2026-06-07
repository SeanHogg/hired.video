/**
 * Content-edit helpers for resume feedback.
 *
 * `applySuggestedEdit` applies one reviewer-proposed field change to a resume's
 * `content` when the owner accepts an annotation. `validateProposedDraft`
 * narrows an opaque reviewer-submitted draft to `ResumeContent` before it is
 * stored as a proposed `resume_versions` row.
 *
 * Targeting (mirrors shared/resume-feedback.ts SuggestedEdit):
 *   • sectionKey === "basics" → set `fieldPath` on the basics object.
 *   • otherwise               → find `content[sectionKey][i]` by `id ===
 *     referenceId` and set `fieldPath` on it.
 * `fieldPath` supports dotted + bracketed paths ("summary", "highlights[1]").
 */
import { ResumeContentSchema, type ResumeContent } from "../../../../shared/resume.js";
import type { SuggestedEdit } from "../../../../shared/resume-feedback.js";

export class ContentEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentEditError";
  }
}

/** Tokenise a path like `highlights[1].text` into `["highlights", 1, "text"]`. */
function parsePath(path: string): Array<string | number> {
  const out: Array<string | number> = [];
  for (const seg of path.split(".")) {
    const m = seg.match(/^([^[\]]+)((\[\d+\])*)$/);
    if (!m) throw new ContentEditError(`Invalid field path segment: "${seg}"`);
    out.push(m[1]);
    const idx = m[2].match(/\d+/g);
    if (idx) for (const n of idx) out.push(Number(n));
  }
  return out;
}

/** Set `value` at `path` inside `target`, mutating it. Intermediate
 *  containers must already exist (we never invent shape on a resume). */
function setByPath(target: any, path: string, value: string): void {
  const tokens = parsePath(path);
  let cur = target;
  for (let i = 0; i < tokens.length - 1; i++) {
    const key = tokens[i];
    if (cur == null || typeof cur !== "object") {
      throw new ContentEditError(`Cannot resolve "${path}" — missing container`);
    }
    cur = cur[key as any];
  }
  const last = tokens[tokens.length - 1];
  if (cur == null || typeof cur !== "object") {
    throw new ContentEditError(`Cannot set "${path}" — target is not an object`);
  }
  cur[last as any] = value;
}

/**
 * Apply one accepted suggested edit. Returns a NEW content object (the input
 * is never mutated) so callers can persist atomically. Throws
 * `ContentEditError` when the target can't be located — the caller maps that
 * to a 409 so the owner sees "this suggestion no longer applies."
 */
export function applySuggestedEdit(content: unknown, edit: SuggestedEdit): unknown {
  const next = JSON.parse(JSON.stringify(content ?? {}));

  if (edit.sectionKey === "basics") {
    if (next.basics == null || typeof next.basics !== "object") {
      throw new ContentEditError("Resume has no basics section to edit");
    }
    setByPath(next.basics, edit.fieldPath, edit.after);
    return next;
  }

  const section = next[edit.sectionKey];
  if (!Array.isArray(section)) {
    throw new ContentEditError(`Section "${edit.sectionKey}" is not editable`);
  }
  if (!edit.referenceId) {
    throw new ContentEditError("Suggested edit is missing the item referenceId");
  }
  const item = section.find((it: any) => it && it.id === edit.referenceId);
  if (!item) {
    throw new ContentEditError(
      `Item ${edit.referenceId} no longer exists in "${edit.sectionKey}"`,
    );
  }
  setByPath(item, edit.fieldPath, edit.after);
  return next;
}

/** Validate an opaque reviewer-submitted draft as `ResumeContent`. */
export function validateProposedDraft(raw: unknown): ResumeContent {
  const parsed = ResumeContentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ContentEditError("Proposed draft is not a valid resume");
  }
  return parsed.data;
}
