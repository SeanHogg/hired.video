/**
 * Field-schema core — the types and builders every entity's document section
 * schema is declared with (résumé in `document-field-schema.ts`, job in
 * `job-field-schema.ts`, company in `company-field-schema.ts`). Split out so
 * each entity's schema is its own module and the registry stays small;
 * `document-field-schema.ts` re-exports everything here, so callers keep one
 * import path.
 */
import { newId } from "@/lib/studio/editor-v2/document-edit";

export type FieldType =
  | "text"
  | "textarea"
  // Month-precision text (resume dates are "YYYY-MM").
  | "date"
  // Full-date picker (`<input type="date">`, "YYYY-MM-DD") — job go-live / expiry.
  | "day"
  // One value per line ⇄ string[] (resume highlights).
  | "list"
  // Free-text tag pills ⇄ string[] (tags / keywords) — type-and-enter.
  | "chips"
  | "number"
  | "select"
  // Multiple enum values → number[] (job employment types).
  | "multiselect"
  | "image";

export interface FieldOption {
  value: string;
  label: string;
  /** i18n key for the label; `label` is the fallback (pure module — the
   *  rendering component translates). */
  labelKey?: string;
}

/** Anything with an English `label` and an optional i18n `labelKey`. */
export interface Labelled {
  label: string;
  labelKey?: string;
}

/** Translate function shape (react-i18next `t` satisfies it). */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

/** The display label: the translated `labelKey` when there is one. */
export function localizedLabel(item: Labelled, t: Translate): string {
  return item.labelKey ? t(item.labelKey) : item.label;
}

/** "Full-time" → "studioFields.option.fullTime" — the shared option vocabulary
 *  (the résumé selects use the same keys). */
export function optionLabelKey(label: string): string {
  const [first = "", ...rest] = label.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const camel =
    first.toLowerCase() + rest.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
  return `studioFields.option.${camel}`;
}

/** Adapt a canonical numeric `*_OPTIONS` enum list (the single source in
 *  `constants/enums.ts`) to the string-valued `FieldOption` the schema uses;
 *  fields flag `numeric` so the editor coerces the value back to a number. */
export function enumFieldOptions(
  opts: readonly { value: number; label: string }[],
): FieldOption[] {
  return opts.map((o) => ({ value: String(o.value), label: o.label, labelKey: optionLabelKey(o.label) }));
}

/** Declarative validation a field carries so render + edit + save-gate share
 *  ONE rule set (#1916). Format/range checks only fire on a NON-empty value (so
 *  they never block saving an empty draft); emptiness is checked only in the
 *  PUBLISH tier (`publishRequired`, field-validation.ts). */
export interface FieldValidation {
  /** Must be filled before the document goes public (publish tier only — a
   *  draft still saves empty). */
  publishRequired?: boolean;
  /** Well-known string format. */
  format?: "email" | "url";
  /** Numeric bounds (number fields). */
  min?: number;
  max?: number;
  /** Character cap (text / textarea). */
  maxLength?: number;
  /** Minimum length to PUBLISH (publish tier only — a draft being typed never
   *  blocks on it). The job description's 50-character floor (#1915). */
  minLength?: number;
}

export interface SectionFieldDef {
  key: string;
  label: string;
  /** i18n key for the label (see `localizedLabel`). */
  labelKey?: string;
  type: FieldType;
  /** Choices for `type === "select"`. */
  options?: FieldOption[];
  /** Store the value as a number, not a string — for `number` fields and
   *  enum `select`s backed by numeric columns (job workSetting / status). */
  numeric?: boolean;
  /** Optional value-format/range validation. */
  validate?: FieldValidation;
  /** The read-only view shows this field as the section's heading (a job's
   *  title, a company's name) instead of a "Label: value" line. */
  heading?: boolean;
}

/** Whether a section maps onto a repeating list or a single object. */
export type SectionShape = "array" | "object";

export interface DocumentSectionSchema {
  /** Content key (array sections) or the object key (object sections with an
   *  `objectPath`). For root object sections (jobs) it's just the block id. */
  sectionKey: string;
  /** Section heading default. */
  label: string;
  /** i18n key for the heading (see `localizedLabel`). */
  labelKey?: string;
  shape: SectionShape;
  /** Object sections: the content key the object lives under. Undefined = the
   *  content root object itself (the flat job record). Ignored for arrays. */
  objectPath?: string;
  fields: SectionFieldDef[];
  /** Cross-field date order check: when BOTH dates are present the `end` must
   *  not precede the `start` (string compare works for YYYY-MM / YYYY-MM-DD).
   *  The error surfaces on the `end` field. */
  dateRange?: { start: string; end: string };
  /** Mint a blank array item with a stable id + empty fields. */
  newItem: () => Record<string, unknown>;
}

function blank(fields: SectionFieldDef[]): Record<string, unknown> {
  const item: Record<string, unknown> = { id: newId("item") };
  for (const f of fields) item[f.key] = f.type === "list" ? [] : "";
  return item;
}

export function arraySchema(
  sectionKey: string,
  label: string,
  fields: SectionFieldDef[],
  dateRange?: { start: string; end: string },
): DocumentSectionSchema {
  return { sectionKey, label, shape: "array", fields, dateRange, newItem: () => blank(fields) };
}

export function objectSchema(
  sectionKey: string,
  label: string,
  fields: SectionFieldDef[],
  objectPath?: string,
  dateRange?: { start: string; end: string },
): DocumentSectionSchema {
  return {
    sectionKey,
    label,
    shape: "object",
    objectPath,
    dateRange,
    fields,
    newItem: () => blank(fields),
  };
}

/** A section of a FLAT entity record (job, company): an object section on the
 *  content root (no `objectPath`) with a translated heading. */
export function rootSection(
  sectionKey: string,
  label: string,
  labelKey: string,
  fields: SectionFieldDef[],
): DocumentSectionSchema {
  return { ...objectSchema(sectionKey, label, fields), labelKey };
}
