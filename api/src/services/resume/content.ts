/**
 * Resume content service — the Validate-Transform-Fix pipe every resume
 * write must go through. Services call `healAndValidateContent(input)`
 * before handing content to `ResumeRepository`; the repo is a thin
 * Drizzle wrapper and deliberately does not re-validate.
 *
 * Heal steps applied in order:
 *   1. `normalizeJsonResume` — PascalCase → camelCase (legacy exports).
 *   2. Fill missing top-level sections with empty arrays so downstream
 *      consumers can rely on `content.work`, `content.skills`, … always
 *      being present.
 *   3. `coerceNullArrays` — JSON-null → `[]` on every field the schema
 *      defines as an array. Covers both top-level sections (`work: null`)
 *      and nested collections (`education[i].courses: null`, which is
 *      exactly what tripped the 2026-04-22 support ticket).
 *   4. `ResumeContentSchema.safeParse` — Zod defaults (`.default([])`,
 *      string/number coercion) run, producing a canonical ResumeContent
 *      the repo can persist without further transformation.
 *
 * Shape of the result: a flat `{ ok, content, issues }` object rather
 * than a discriminated union. The api package runs with `strict: false`
 * (see tsconfig), and without strictNullChecks, TypeScript's variant
 * narrowing on `if (result.ok)` isn't reliable — consumers have to
 * read a single field regardless of branch, so a flat shape is safer.
 */

import {
  ResumeContentSchema,
  type ResumeContent,
} from "../../../../shared/resume.js";
import { normalizeJsonResume } from "./parse.js";

// ─── Normalisation primitives (pure, no IO) ──────────────────────────────────

const EMPTY_CONTENT_DEFAULTS = {
  work: [],
  volunteer: [],
  education: [],
  awards: [],
  certificates: [],
  publications: [],
  skills: [],
  languages: [],
  interests: [],
  references: [],
  projects: [],
  metaData: [],
  skillEvidence: [],
} as const;

/** Field names whose value must be an array per ResumeContentSchema.
 *  Legacy rows and a few AI-parse paths persist JSON-null here. The heal
 *  step coerces to `[]` so the blob parses against the schema. Both
 *  top-level section keys and nested collections are covered. */
const ARRAY_FIELDS = new Set([
  "work",
  "volunteer",
  "education",
  "awards",
  "certificates",
  "publications",
  "skills",
  "languages",
  "interests",
  "references",
  "projects",
  "metaData",
  "skillEvidence",
  "highlights",
  "courses",
  "keywords",
  "roles",
]);

function coerceNullArrays(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(coerceNullArrays);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (ARRAY_FIELDS.has(k) && v === null) out[k] = [];
      else out[k] = coerceNullArrays(v);
    }
    return out;
  }
  return value;
}

/** Normalize a stored content blob to the canonical camelCase JSON Resume
 *  shape, filling empty arrays for sections the writer omitted so
 *  downstream consumers can rely on section arrays always being present.
 *  Read-side only — no null coercion, no schema validation. Write-side
 *  callers must use `healAndValidateContent`. */
export function normalizeContent(content: unknown): Record<string, unknown> {
  const normalized = normalizeJsonResume(content);
  for (const [k, v] of Object.entries(EMPTY_CONTENT_DEFAULTS)) {
    if (!(k in normalized)) (normalized as Record<string, unknown>)[k] = v;
  }
  return normalized;
}

// ─── Validate-Transform-Fix ──────────────────────────────────────────────────

/** A single issue surfaced by `healAndValidateContent`. `path` is the
 *  dotted JSON path to the offending node; `message` is Zod's message. */
export interface ResumeContentIssue {
  path: string;
  message: string;
}

// ─── Branded value object (DDD) ──────────────────────────────────────────────

/** Compile-time marker that a `ResumeContent` value has been run through
 *  `healAndValidateContent` — it represents a schema-valid canonical
 *  document. Callers should NEVER construct a `ValidatedResumeContent`
 *  by casting; the only way to get one is from `healAndValidateContent`.
 *  The repo's `insertOne` / `updateByIdForOwner` accept the underlying
 *  `ResumeContent` type directly (Drizzle can't express the brand), but
 *  the layering rule is: services must always have a branded value in
 *  hand before writing. */
declare const resumeContentValidated: unique symbol;
export type ValidatedResumeContent = ResumeContent & {
  readonly [resumeContentValidated]: true;
};

export interface HealResult {
  /** true when heal produced a schema-valid ResumeContent. */
  ok: boolean;
  /** Branded `ValidatedResumeContent` when `ok`. `null` when `ok` is false. */
  content: ValidatedResumeContent | null;
  /** Schema violations remaining after the heal pass. Empty when `ok`. */
  issues: ResumeContentIssue[];
}

/** Heal-then-validate a resume `content` blob. Every write path —
 *  user submit, AI parse, merge, clone, import, admin heal — must go
 *  through this before calling `ResumeRepository`.
 *
 *  On success → `{ ok: true, content, issues: [] }`.
 *  On failure → `{ ok: false, content: null, issues }` with dotted paths
 *  so the caller can log exactly what broke. */
export function healAndValidateContent(input: unknown): HealResult {
  const healed = healResumeContent(input);
  const parsed = ResumeContentSchema.safeParse(healed);
  if (!parsed.success) {
    return {
      ok: false,
      content: null,
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    };
  }
  // The brand is a compile-time fiction — at runtime the value IS just
  // a parsed ResumeContent. The single assertion here is the ONLY
  // sanctioned way to construct a ValidatedResumeContent; everywhere
  // else in the codebase consumes it as an opaque type.
  return { ok: true, content: parsed.data as ValidatedResumeContent, issues: [] };
}

/** The heal/transform step on its own — for callers that need the
 *  normalised shape before layering in further changes (e.g. a merge
 *  pipeline that rewrites fields post-heal). Most callers should use
 *  `healAndValidateContent` instead so the schema stays authoritative. */
export function healResumeContent(input: unknown): Record<string, unknown> {
  return coerceNullArrays(normalizeContent(input)) as Record<string, unknown>;
}

// ─── Emptiness detection ─────────────────────────────────────────────────────

/** Per-section identity keys. An entry is treated as "real" only if at
 *  least one of these keys is populated. Lets callers distinguish a row
 *  like `{institution: "University of X"}` (real) from a placeholder
 *  stub like `{institution: "", area: ""}` (Zod defaults, not data).
 *
 *  Single source of truth — resume heal, AI-parse merge, and variation
 *  carry-over all consult this table so they can't drift. */
export const SECTION_ID_KEYS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  work: ["name", "position"],
  education: ["institution", "area"],
  skills: ["name"],
  volunteer: ["organization", "position"],
  awards: ["title"],
  certificates: ["name"],
  publications: ["name"],
  languages: ["language"],
  interests: ["name"],
  references: ["name"],
  projects: ["name"],
});

/** True when `arr` has at least one entry whose identity key for
 *  `section` carries a non-empty string. Empty arrays and all-stub
 *  arrays return false so callers can keep the prior data. */
export function hasRealSectionContent(arr: unknown, section: string): boolean {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  const idKeys = SECTION_ID_KEYS[section] ?? ["name"];
  return arr.some((item) =>
    item && typeof item === "object" &&
    idKeys.some((k) => {
      const v = (item as Record<string, unknown>)[k];
      return typeof v === "string" && v.trim().length > 0;
    }),
  );
}

/** True when an object value has at least one populated field. Used for
 *  the `basics` section (object, not array) so a `{name: "Sean"}` heal
 *  result is preserved while `{name: "", email: ""}` is rejected. */
export function hasRealObjectContent(obj: unknown): boolean {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  return Object.values(obj as Record<string, unknown>).some((v) =>
    (typeof v === "string" && v.trim().length > 0) ||
    (typeof v === "number") ||
    (typeof v === "boolean") ||
    (v && typeof v === "object"),
  );
}

// ─── Content-only transforms (no heal / validate) ────────────────────────────

/** Merge an incoming resume `content` blob with the metaData (media
 *  attachments) from the existing row. Media is managed by the dedicated
 *  PUT /:id/metadata endpoint, so blindly writing `content` from a resume
 *  edit would wipe out the user's attached media. Callers that
 *  deliberately pass `metaData` are respected. Kept here because it's a
 *  content-level transform that sits next to the heal pipeline; the repo
 *  should not know about the metaData preservation semantics. */
export function preserveMetaData(
  nextContent: unknown,
  existingMetaData: unknown,
): unknown {
  if (!nextContent || typeof nextContent !== "object") return nextContent;
  const next = nextContent as Record<string, unknown>;
  if (next.metaData !== undefined) return next;
  if (existingMetaData === undefined) return next;
  return { ...next, metaData: existingMetaData };
}

/** Mirror of `preserveMetaData` for skill evidence. The skill extractor
 *  writes evidence rows separately from a generic content edit, so a
 *  vanilla resume save that didn't touch the skill graph must not blow
 *  away an evidence array the user spent tokens to populate. Same omit-
 *  vs-empty discipline: undefined preserves, [] clears intentionally. */
export function preserveSkillEvidence(
  nextContent: unknown,
  existingSkillEvidence: unknown,
): unknown {
  if (!nextContent || typeof nextContent !== "object") return nextContent;
  const next = nextContent as Record<string, unknown>;
  if (next.skillEvidence !== undefined) return next;
  if (existingSkillEvidence === undefined) return next;
  return { ...next, skillEvidence: existingSkillEvidence };
}
