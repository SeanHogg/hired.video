/**
 * Branded value types — nominal types for strings that carry an invariant.
 *
 * TypeScript structural typing means any `string` is assignable to any
 * other `string`-typed parameter, so "UserId" and "ResumeId" are
 * interchangeable at compile time unless we brand them. Branding adds a
 * phantom marker that only the module's parse function can satisfy, so
 * mixing up a ResumeId and a UserId becomes a type error.
 *
 * The "parse, don't validate" discipline: once you hold a `Slug`, it's
 * guaranteed well-formed. Callers that need a `Slug` accept it directly
 * rather than taking `string` and re-validating — the compiler proves
 * validation happened upstream.
 *
 *   const raw: string = req.body.slug;
 *   const slug: Slug = parseSlug(raw);        // throws on invalid input
 *   setSlug(slug);                             // accepts Slug, not string
 *
 *   // With Zod schemas that .transform() into branded types:
 *   const parsed = SlugSchema.safeParse(raw);
 *   if (parsed.success) setSlug(parsed.data); // parsed.data is typed as Slug
 */

// ---------------------------------------------------------------------------
// Branding machinery — a unique symbol marker per type
// ---------------------------------------------------------------------------

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

export type UserId = Brand<string, "UserId">;
export type ResumeId = Brand<string, "ResumeId">;
export type CompanyId = Brand<string, "CompanyId">;
export type JobId = Brand<string, "JobId">;
export type SubscriptionId = Brand<string, "SubscriptionId">;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseUuid<T extends string>(kind: string, raw: string): T {
  if (!UUID_RE.test(raw)) {
    throw new Error(`Invalid ${kind}: expected UUID, got "${raw}"`);
  }
  return raw as T;
}

export const parseUserId = (raw: string): UserId => parseUuid("UserId", raw);
export const parseResumeId = (raw: string): ResumeId => parseUuid("ResumeId", raw);
export const parseCompanyId = (raw: string): CompanyId => parseUuid("CompanyId", raw);
export const parseJobId = (raw: string): JobId => parseUuid("JobId", raw);
export const parseSubscriptionId = (raw: string): SubscriptionId =>
  parseUuid("SubscriptionId", raw);

/** Safe variants — return null on invalid input. Use when the caller is
 *  already framing a VALIDATION_ERROR response and doesn't want exceptions. */
export function tryParseUserId(raw: string | null | undefined): UserId | null {
  return raw && UUID_RE.test(raw) ? (raw as UserId) : null;
}
export function tryParseResumeId(raw: string | null | undefined): ResumeId | null {
  return raw && UUID_RE.test(raw) ? (raw as ResumeId) : null;
}

// ---------------------------------------------------------------------------
// Slug — human-readable URL fragment. Must NOT look like a UUID (the
// original 2026-04-19 bug was a UUID passed as a slug).
// ---------------------------------------------------------------------------

export type Slug = Brand<string, "Slug">;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_SLUG = 3;
const MAX_SLUG = 64;

export function parseSlug(raw: string): Slug {
  if (raw.length < MIN_SLUG) {
    throw new Error(`Slug too short (min ${MIN_SLUG} chars)`);
  }
  if (raw.length > MAX_SLUG) {
    throw new Error(`Slug too long (max ${MAX_SLUG} chars)`);
  }
  if (UUID_RE.test(raw)) {
    throw new Error("Slug must not look like a UUID");
  }
  if (!SLUG_RE.test(raw)) {
    throw new Error(`Slug must be lowercase alphanumeric with single hyphens`);
  }
  return raw as Slug;
}

export function isSlug(raw: string): raw is Slug {
  return (
    raw.length >= MIN_SLUG &&
    raw.length <= MAX_SLUG &&
    !UUID_RE.test(raw) &&
    SLUG_RE.test(raw)
  );
}

// ---------------------------------------------------------------------------
// Privacy — the resume visibility enum. Constructor guarantees a legal
// value so the backend's "unknown → private" silent-fallback bug can't
// come back.
// ---------------------------------------------------------------------------

export const PRIVACY_VALUES = [
  "public",
  "recruiter_only",
  "connections",
  "private",
  "draft",
] as const;
export type Privacy = (typeof PRIVACY_VALUES)[number];

export function isPrivacy(raw: string): raw is Privacy {
  return (PRIVACY_VALUES as readonly string[]).includes(raw);
}

export function parsePrivacy(raw: string): Privacy {
  if (!isPrivacy(raw)) {
    throw new Error(
      `Invalid privacy value "${raw}" — expected one of ${PRIVACY_VALUES.join(", ")}`,
    );
  }
  return raw;
}
