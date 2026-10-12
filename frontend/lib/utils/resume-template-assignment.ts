/**
 * resume-template-assignment.ts — pure payload builders for assigning a
 * template descriptor to a resume's default view or embedded view.
 *
 * Extracted so this isn't inlined in ResumeDetail.tsx, where a single
 * casing slip ("Meta" vs "meta") silently broke persistence:
 *   - The backend's ResumeContentSchema is `.strip()`-mode Zod, so any
 *     unknown root key is dropped without error.
 *   - PascalCase `Meta` is unknown → silently lost → toast says "saved"
 *     while DB stays unchanged.
 *
 * These builders are the single source of truth for the casing.
 */

export type TemplateSlot = "template" | "embeddedTemplate";

/**
 * Build a content patch that assigns `templateId` to either the default
 * view (slot = "template") or the embedded view (slot = "embeddedTemplate").
 *
 * Spreads existing content so other fields (basics, work, etc.) survive
 * the round-trip, and merges into the existing `meta` object so the other
 * slot is preserved.
 *
 * IMPORTANT: returns lowercase `meta` — DO NOT change to PascalCase. The
 * server schema strips unknown keys, so a PascalCase `Meta` would be
 * silently dropped.
 */
export function buildTemplateAssignmentContent(
  existingContent: Record<string, unknown> | null | undefined,
  slot: TemplateSlot,
  templateId: string,
): Record<string, unknown> {
  const existing = (existingContent ?? {}) as Record<string, unknown>;
  const existingMeta = (existing.meta ?? {}) as Record<string, unknown>;
  return {
    ...existing,
    meta: { ...existingMeta, [slot]: templateId },
  };
}
