/**
 * Validation primitives shared between the API + frontend + shared
 * packages. Keep this file LEAN — only schemas with real cross-package
 * consumers belong here. Domain schemas (resume, job, company, user
 * profile) live next to their feature in `api/src/routes/*.ts` or
 * `frontend/lib/services/*.ts`; don't reintroduce them here unless two
 * packages legitimately need the same wire shape.
 *
 * History: a former v1 of this file shipped `UserDataSchema`,
 * `CompanyDataSchema`, `JobDataSchema`, `ResumeDataSchema` and friends
 * — none of those were ever imported externally (the frontend has its
 * own local `CompanyDataSchema`; nothing else referenced them at all)
 * and they were removed alongside the #1522 sweep on 2026-05-26 per
 * the "clean up dead code" rule. If you find yourself adding a similar
 * domain schema here, ask first whether two packages will actually
 * consume it.
 */

import { z } from "zod";

/**
 * Strict RFC 4122 UUID — Zod 4's `.uuid()` regex. Variant nibble MUST
 * be `[89abAB]`, version nibble `[1-8]`. Use this only for IDs your
 * own code generates fresh (e.g. via `crypto.randomUUID()` or
 * `gen_random_uuid()`). For any ID that arrives from a DB row, use
 * `UuidLikeSchema` instead — see the doc block below for why.
 */
export const UuidSchema = z.string().uuid("Invalid UUID format");

/**
 * Permissive UUID-format regex — 8-4-4-4-12 hex, no version/variant
 * constraint. Exported so route handlers that want a custom error
 * message can do `z.string().regex(UUID_LIKE_REGEX, "<my msg>")`
 * without re-inventing the pattern.
 */
export const UUID_LIKE_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Permissive UUID-format schema for DB-row IDs.
 *
 * Why this exists alongside `UuidSchema`: seed migrations
 * (`0113_so_you_want_to_become_articles.sql`,
 * `0131_seed_platform_learning_library.sql`) generate deterministic IDs
 * via `md5(slug)::uuid` so re-applying the migration yields stable IDs
 * that downstream tables can reference. MD5 hashes don't carry RFC 4122
 * version/variant bits, so Zod 4's strict `.uuid()` rejects them — the
 * variant slot must be `[89abAB]`, but md5-derived UUIDs land on any
 * nibble. Use `UuidLikeSchema` anywhere a route validates an ID that
 * arrived from a DB row (lessonId, courseId, etc.) — the bit pattern
 * has no functional meaning for the lookup; only the shape matters.
 * Reserve strict `UuidSchema` for IDs you generate fresh in app code.
 */
export const UuidLikeSchema = z.string().regex(UUID_LIKE_REGEX, "Invalid UUID format");

/** Non-empty string. Used by `shared/account.ts` (invite metadata). */
export const NonEmptyStringSchema = z.string().min(1, "Field cannot be empty");

/** RFC 5322-ish email. Used by `shared/account.ts` (invitee email). */
export const EmailSchema = z.string().email("Invalid email format");

/**
 * Optional URL that accepts the empty string as "cleared". `z.string().url()`
 * rejects `""`, which traps every form that ships an "" placeholder for an
 * unset URL field — and every `UrlPickerInput` consumer does (frontend
 * `value` is `string`, not `string | null`). Use this anywhere a URL field
 * is optional and the UI lets the user clear it back to empty.
 * Empty string normalises to `undefined` so the storage / persistence layer
 * doesn't have to special-case both `""` and `undefined`.
 *
 * `max=2000` is a generous abuse-cap that comfortably covers every real
 * URL form (browsers themselves cap around 2048). Callers that want a
 * tighter cap can enforce it after parse — but in practice 2000 is fine.
 */
export const OptionalUrlSchema = z
  .union([z.string().url("Invalid URL format").max(2000), z.literal("")])
  .optional()
  .transform((v) => (v === "" ? undefined : v));
