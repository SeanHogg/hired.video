/**
 * Which résumé sections the kit workspace can edit, and how a section key
 * coming from the rendered page maps onto one. Pure — the field definitions
 * themselves are the studio's declarative schema (document-field-schema.ts),
 * so the workspace and every other field-bound editor share ONE source.
 */
import type { ResumeContent } from "@shared/resume";
import {
  documentSectionSchema,
  documentSectionSchemasFor,
} from "@/lib/studio/document/document-field-schema";

/** Component blocks on the rendered page that present a content section. */
const COMPONENT_SECTION: Readonly<Record<string, string>> = {
  "career-timeline": "work",
};

/** Every editable résumé section key, header first. */
export const EDITABLE_RESUME_SECTIONS: readonly string[] = documentSectionSchemasFor("resume").map(
  (s) => s.sectionKey,
);

/** Map a key from the renderer (a block id or "basics") to an editable
 *  section, or null when that block has no fields to edit. */
export function resolveEditableSection(key: string | null | undefined): string | null {
  if (!key) return null;
  const mapped = COMPONENT_SECTION[key] ?? key;
  return documentSectionSchema("resume", mapped) ? mapped : null;
}

/** i18n key for a section's name (the `tabs.<section>` keys the résumé
 *  editor tabs already use). */
export function sectionLabelKey(sectionKey: string): string {
  return `tabs.${sectionKey}`;
}

/** Item count for an array section; null for the object header. */
export function sectionItemCount(content: ResumeContent, sectionKey: string): number | null {
  const value = (content as unknown as Record<string, unknown>)[sectionKey];
  if (Array.isArray(value)) return value.length;
  return null;
}
