/**
 * Field validation for the document canvas (#1916) — the ONE rule engine the
 * inline editor ([FieldGroupEditor](../../../components/studio/fields/FieldGroupEditor.tsx))
 * and the save-gate ([StudioEditorV2](../../../pages/studio/v2/StudioEditorV2.tsx)
 * `handleSave`) both call, so what shows red as you type is exactly what blocks
 * the save. Rules are declared on the field schema (`SectionFieldDef.validate`
 * + `DocumentSectionSchema.dateRange`).
 *
 * Checks fire ONLY on a non-empty value — an empty field is never an error here,
 * so a partial draft always saves. (Hard "required" gating is deliberately not
 * modelled: it conflicts with draft-save, and belongs in a future save-vs-publish
 * validation tier — see gap #1916.)
 */
import type { DocumentEntityKind } from "@/lib/studio/editor-v2/document-state";
import {
  documentSectionSchemasFor,
  type DocumentSectionSchema,
  type SectionFieldDef,
} from "./document-field-schema";

export type FieldErrors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function isValidUrl(raw: string): boolean {
  const v = raw.trim();
  if (!v || /\s/.test(v)) return false;
  try {
    // Accept bare domains (linkedin.com/in/x) by defaulting the scheme.
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return Boolean(u.hostname) && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Validate a single field's value. Returns a message or null. */
export function validateField(field: SectionFieldDef, value: unknown): string | null {
  if (isEmpty(value)) return null;
  const rules = field.validate;
  if (!rules) return null;

  if (rules.format === "email" && typeof value === "string" && !EMAIL_RE.test(value.trim())) {
    return "Enter a valid email address";
  }
  if (rules.format === "url" && typeof value === "string" && !isValidUrl(value)) {
    return "Enter a valid URL";
  }
  if (typeof value === "number") {
    if (rules.min !== undefined && value < rules.min) return `Must be ${rules.min} or more`;
    if (rules.max !== undefined && value > rules.max) return `Must be ${rules.max} or less`;
  }
  if (rules.maxLength !== undefined && typeof value === "string" && value.length > rules.maxLength) {
    return `Keep it under ${rules.maxLength} characters`;
  }
  return null;
}

/** Per-field errors for a flat values object against a field list. */
export function validateFields(
  fields: SectionFieldDef[],
  values: Record<string, unknown>,
): FieldErrors {
  const out: FieldErrors = {};
  for (const f of fields) {
    const err = validateField(f, values[f.key]);
    if (err) out[f.key] = err;
  }
  return out;
}

/** Cross-field date-order error (keyed on the `end` field) for one item. */
export function validateDateRange(
  schema: DocumentSectionSchema,
  values: Record<string, unknown>,
): FieldErrors {
  const range = schema.dateRange;
  if (!range) return {};
  const start = values[range.start];
  const end = values[range.end];
  if (typeof start === "string" && typeof end === "string" && start && end && end < start) {
    return { [range.end]: "End can't be before start" };
  }
  return {};
}

/** All errors for one item/object of a section (field rules + date range). */
export function validateSectionValues(
  schema: DocumentSectionSchema,
  values: Record<string, unknown>,
): FieldErrors {
  return { ...validateFields(schema.fields, values), ...validateDateRange(schema, values) };
}

/**
 * Validate the whole document content blob for an entity. Returns a flat list
 * of human-readable issues (`"Work Experience · Website: Enter a valid URL"`);
 * empty = clean. Drives the save-gate toast.
 */
export function validateDocumentContent(
  entityKind: DocumentEntityKind,
  content: Record<string, unknown> | null | undefined,
): string[] {
  if (!content) return [];
  const issues: string[] = [];
  const labelFor = (schema: DocumentSectionSchema, key: string): string =>
    schema.fields.find((f) => f.key === key)?.label ?? key;

  for (const schema of documentSectionSchemasFor(entityKind)) {
    const collect = (values: Record<string, unknown>) => {
      const errs = validateSectionValues(schema, values);
      for (const [key, msg] of Object.entries(errs)) {
        issues.push(`${schema.label} · ${labelFor(schema, key)}: ${msg}`);
      }
    };

    if (schema.shape === "array") {
      const rows = content[schema.sectionKey];
      if (Array.isArray(rows)) {
        for (const row of rows) {
          if (row && typeof row === "object") collect(row as Record<string, unknown>);
        }
      }
    } else {
      const obj = schema.objectPath
        ? (content[schema.objectPath] as Record<string, unknown> | undefined)
        : content;
      if (obj && typeof obj === "object") collect(obj);
    }
  }
  return issues;
}
