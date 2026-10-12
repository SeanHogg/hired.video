/**
 * Document entity kinds — which entity a studio `document` renders, and so
 * which kind of document a studio template is.
 *
 * One registry for both sides:
 *   - the frontend's DocumentState (`entityKind`) and the template picker;
 *   - `studio_templates.document_kind` (mig 0519), the column that says a
 *     studio template is a résumé / job / article / blog / company template.
 *     Its CHECK constraint enumerates exactly these values ('company' added
 *     with #1915 — the company page is a document like a job posting).
 *
 * A résumé template is therefore just a studio template with
 * `media_kind = 'document'` and `document_kind = 'resume'` — not a separate
 * table or flow.
 *
 * Pure leaf module (no runtime imports).
 */

export const DOCUMENT_ENTITY_KINDS = ["resume", "article", "job", "blog", "company"] as const;
export type DocumentEntityKind = (typeof DOCUMENT_ENTITY_KINDS)[number];

export function isDocumentEntityKind(value: unknown): value is DocumentEntityKind {
  return typeof value === "string" && (DOCUMENT_ENTITY_KINDS as readonly string[]).includes(value);
}

/** The entity kind a stored DocumentState-shaped payload targets, or null for
 *  a malformed / non-document payload. */
export function documentEntityKindOf(payload: unknown): DocumentEntityKind | null {
  if (!payload || typeof payload !== "object") return null;
  const kind = (payload as { entityKind?: unknown }).entityKind;
  return isDocumentEntityKind(kind) ? kind : null;
}
