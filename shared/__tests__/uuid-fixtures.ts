/**
 * UUID test fixtures shared across every schema/route test in the repo.
 *
 * The pair `V4_UUID` + `SEED_DERIVED_UUID` is the load-bearing one — any
 * Zod schema that validates a DB-row ID MUST accept both shapes (#1522):
 *
 *   - `V4_UUID`           — what `gen_random_uuid()` and `crypto.randomUUID()`
 *                           emit at runtime. RFC 4122 v4, variant 8/9/a/b.
 *   - `SEED_DERIVED_UUID` — what `md5(slug)::uuid` emits in seed migrations
 *                           (`0113_so_you_want_to_become_articles.sql`,
 *                           `0131_seed_platform_learning_library.sql`).
 *                           Version + variant nibbles can be ANY hex —
 *                           this exact value (`c87f7656-…-d100-…`) was
 *                           pulled verbatim from the prod support ticket
 *                           that opened #1522.
 *
 * `NIL_UUID` / `MAX_UUID` / `V1_UUID` / `V7_UUID_RFC` are supplementary
 * shape variants for boundary tests in `validation.test.ts`. The shape
 * failures (`SHAPE_FAILURES`) bundle every "looks vaguely UUID-shaped
 * but isn't" string so individual tests stay short.
 *
 * Filename intentionally lacks `.test.ts` so the `node --test` runner
 * doesn't pick it up — it's a fixtures module, not a test suite.
 */

/** Runtime-generated v4 (gen_random_uuid / crypto.randomUUID). */
export const V4_UUID = "6fd07e16-f141-4a82-9baa-f56dcc4aa566";

/**
 * `md5('seed-lesson:…')::uuid` output — the EXACT value the prod 400 was
 * triggered with. Version=7, variant=d (non-RFC-4122). Pinning this verbatim
 * is the regression check for #1522: any change that makes UuidLikeSchema
 * reject it re-opens the bug.
 */
export const SEED_DERIVED_UUID = "c87f7656-673a-7756-d100-281032a50731";

/** Other valid RFC-conformant UUID variants — for completeness. */
export const V1_UUID = "550e8400-e29b-11d4-a716-446655440000";
export const V7_UUID_RFC = "01891234-5678-7abc-89ab-cdef01234567"; // version=7, variant=8

/** Special-case canonical values from RFC 4122 §4.1.7. */
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";
export const MAX_UUID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

/**
 * Synthetic v4-shaped UUID kept as a stable fixture for older tests
 * (e.g. scorecards/__tests__/schemas.test.ts) that need a UUID but
 * don't otherwise care about the bit pattern. Same RFC-conformant
 * shape `V4_UUID` has, just memorable.
 */
export const SYNTHETIC_V4_UUID = "00000000-0000-4000-8000-000000000000";

/**
 * Inputs that must fail BOTH `UuidSchema` and `UuidLikeSchema`. Bundled
 * so individual tests can iterate and assert without restating the list.
 */
export const SHAPE_FAILURES = {
  tooShort: "6fd07e16-f141-4a82-9baa-f56dcc4aa56", // last group 11 chars
  tooLong: "6fd07e16-f141-4a82-9baa-f56dcc4aa5666", // last group 13 chars
  nonHex: "ghijklmn-f141-4a82-9baa-f56dcc4aa566",
  wrongSeparators: "6fd07e16_f141_4a82_9baa_f56dcc4aa566",
  noSeparators: "6fd07e16f1414a829baaf56dcc4aa566",
  trailingWhitespace: "6fd07e16-f141-4a82-9baa-f56dcc4aa566 ",
  leadingWhitespace: " 6fd07e16-f141-4a82-9baa-f56dcc4aa566",
  empty: "",
} as const;
