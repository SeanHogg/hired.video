/**
 * Which document entities have an owner inspector in the studio's right slot
 * — the ONE rule format-runtime's `hasInspector` and the document surface
 * agree on. A job's inspector holds its attached video + geo tags (from the
 * retired JobCreatePage, so a NEW posting has it too) and, once saved, its
 * screening setup (#1918); a company's holds its embed settings (moved off the
 * retired CompanyBuilder form, #1915), which need a saved row.
 */
import type { DocumentEntityKind, DocumentState } from "@/lib/studio/editor-v2/document-state";

export const DOCUMENT_INSPECTOR_KINDS: ReadonlySet<DocumentEntityKind> = new Set<DocumentEntityKind>(["job", "company"]);

/** Kinds whose inspector needs the entity row to exist first. */
const NEEDS_SAVED_ROW: ReadonlySet<DocumentEntityKind> = new Set<DocumentEntityKind>(["company"]);

export function documentHasInspector(state: Pick<DocumentState, "entityKind" | "entityId">): boolean {
  if (!DOCUMENT_INSPECTOR_KINDS.has(state.entityKind)) return false;
  return !NEEDS_SAVED_ROW.has(state.entityKind) || !!state.entityId;
}
