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
} from "../../../shared/resume.js";
import { normalizeJsonResume } from "./resume-parse.js";

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

export interface HealResult {
  /** true when heal produced a schema-valid ResumeContent. */
  ok: boolean;
  /** Canonical ResumeContent when `ok`. `null` when `ok` is false. */
  content: ResumeContent | null;
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
  return { ok: true, content: parsed.data, issues: [] };
}

/** The heal/transform step on its own — for callers that need the
 *  normalised shape before layering in further changes (e.g. a merge
 *  pipeline that rewrites fields post-heal). Most callers should use
 *  `healAndValidateContent` instead so the schema stays authoritative. */
export function healResumeContent(input: unknown): Record<string, unknown> {
  return coerceNullArrays(normalizeContent(input)) as Record<string, unknown>;
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
