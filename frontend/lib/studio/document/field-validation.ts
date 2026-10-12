/**
 * Field validation for the document canvas (#1916) — the ONE rule engine the
 * inline editor (FieldGroupEditor (`components/studio/fields/FieldGroupEditor.tsx`))
 * and the save-gate (StudioEditorV2 (`pages/studio/v2/StudioEditorV2.tsx`)
 * `handleSave`) both call, so what shows red as you type is exactly what blocks
 * the save. Rules are declared on the field schema (`SectionFieldDef.validate`
 * + `DocumentSectionSchema.dateRange`).
 *
 * Two tiers (#1916a):
 *   save     format/range checks fire ONLY on a non-empty value — an empty
 *            field is never an error, so a partial draft always saves.
 *   publish  the save checks PLUS "required": a field marked
 *            `validate.publishRequired` (a résumé's name + title, a job's
 *            title) must be filled before the document goes public.
 * `documentValidationTier` says which tier a save is (a job saved with a
 * non-draft status is publishing it).
 *
 * Errors are i18n message KEYS with params (this module is pure); the editor
 * and the save-gate translate them.
 */
import type { DocumentEntityKind } from "@/lib/studio/editor-v2/document-state";
import { JobStatus } from "@/lib/constants/enums";
import {
  documentSectionSchemasFor,
  localizedLabel,
  type DocumentSectionSchema,
  type SectionFieldDef,
  type Translate,
} from "./document-field-schema";

/** A validation message: an i18n key plus its interpolation params. */
export interface FieldError {
  key: string;
  params?: Record<string, number>;
}

export type FieldErrors = Record<string, FieldError>;

export const FIELD_ERROR_KEYS = {
  email: "studioFields.error.email",
  url: "studioFields.error.url",
  min: "studioFields.error.min",
  max: "studioFields.error.max",
  maxLength: "studioFields.error.maxLength",
  minLength: "studioFields.error.minLength",
  endBeforeStart: "studioFields.error.endBeforeStart",
  required: "studio.document.validation.required",
} as const;

/** `save` = drafts (never blocks on emptiness); `publish` = going public. */
export type ValidationTier = "save" | "publish";

/** The tier a save of this content runs in: a job whose status isn't Draft
 *  is being published, and so is a company page whose design is shown to
 *  visitors (`pagePublic` — the studio project's visibility, #1915: the
 *  retired CompanyBuilder's required industry / size / address then apply).
 *  Everything else (drafts, résumé, article) saves. Résumé / article publish
 *  flows ask for "publish" explicitly. */
export function documentValidationTier(
  entityKind: DocumentEntityKind,
  content: Record<string, unknown> | null | undefined,
  pagePublic = false,
): ValidationTier {
  if (entityKind === "job" && content && typeof content.status === "number" && content.status !== JobStatus.Draft) {
    return "publish";
  }
  if (entityKind === "company" && pagePublic) return "publish";
  return "save";
}

export function formatFieldError(error: FieldError, t: Translate): string {
  return t(error.key, error.params);
}

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

/** Validate a single field's value. Returns an error or null. */
export function validateField(field: SectionFieldDef, value: unknown, tier: ValidationTier = "save"): FieldError | null {
  if (typeof value === "string" ? !value.trim() : isEmpty(value)) {
    return tier === "publish" && field.validate?.publishRequired ? { key: FIELD_ERROR_KEYS.required } : null;
  }
  const rules = field.validate;
  if (!rules) return null;

  if (rules.format === "email" && typeof value === "string" && !EMAIL_RE.test(value.trim())) {
    return { key: FIELD_ERROR_KEYS.email };
  }
  if (rules.format === "url" && typeof value === "string" && !isValidUrl(value)) {
    return { key: FIELD_ERROR_KEYS.url };
  }
  if (typeof value === "number") {
    if (rules.min !== undefined && value < rules.min) return { key: FIELD_ERROR_KEYS.min, params: { min: rules.min } };
    if (rules.max !== undefined && value > rules.max) return { key: FIELD_ERROR_KEYS.max, params: { max: rules.max } };
  }
  if (rules.maxLength !== undefined && typeof value === "string" && value.length > rules.maxLength) {
    return { key: FIELD_ERROR_KEYS.maxLength, params: { max: rules.maxLength } };
  }
  if (
    tier === "publish" &&
    rules.minLength !== undefined &&
    typeof value === "string" &&
    value.trim().length < rules.minLength
  ) {
    return { key: FIELD_ERROR_KEYS.minLength, params: { min: rules.minLength } };
  }
  return null;
}

/** Per-field errors for a flat values object against a field list. */
export function validateFields(
  fields: SectionFieldDef[],
  values: Record<string, unknown>,
  tier: ValidationTier = "save",
): FieldErrors {
  const out: FieldErrors = {};
  for (const f of fields) {
    const err = validateField(f, values[f.key], tier);
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
    return { [range.end]: { key: FIELD_ERROR_KEYS.endBeforeStart } };
  }
  return {};
}

/** All errors for one item/object of a section (field rules + date range). */
export function validateSectionValues(
  schema: DocumentSectionSchema,
  values: Record<string, unknown>,
  tier: ValidationTier = "save",
): FieldErrors {
  return { ...validateFields(schema.fields, values, tier), ...validateDateRange(schema, values) };
}

/**
 * Validate the whole document content blob for an entity. Returns a flat list
 * of human-readable issues (`"Work Experience · Website: Enter a valid URL"`),
 * translated with `t`; empty = clean. Drives the save-gate toast. The tier
 * defaults to what the content says (`documentValidationTier`).
 */
export function validateDocumentContent(
  entityKind: DocumentEntityKind,
  content: Record<string, unknown> | null | undefined,
  t: Translate,
  tier: ValidationTier = documentValidationTier(entityKind, content),
): string[] {
  if (!content) return [];
  const issues: string[] = [];
  const labelFor = (schema: DocumentSectionSchema, key: string): string => {
    const field = schema.fields.find((f) => f.key === key);
    return field ? localizedLabel(field, t) : key;
  };

  for (const schema of documentSectionSchemasFor(entityKind)) {
    const collect = (values: Record<string, unknown>) => {
      const errs = validateSectionValues(schema, values, tier);
      for (const [key, err] of Object.entries(errs)) {
        issues.push(`${localizedLabel(schema, t)} · ${labelFor(schema, key)}: ${formatFieldError(err, t)}`);
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
      // A missing object (no `basics` yet) still owes its required fields.
      if (obj && typeof obj === "object") collect(obj);
      else if (tier === "publish") collect({});
    }
  }
  return issues;
}
