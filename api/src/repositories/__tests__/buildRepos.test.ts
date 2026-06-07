/**
 * buildRepos smoke test — closes gap #1315.
 *
 * The 2026-05-25 production incident ("EventsRepository is not defined")
 * happened because `buildRepos()` referenced two classes without importing
 * them. `tsc` catches the missing-import as TS2304, but the api package
 * carries unrelated pre-existing type errors and the new TS2304 got lost
 * in the noise — the broken file shipped because esbuild ignores tsc
 * diagnostics during `wrangler deploy`.
 *
 * This test instantiates `buildRepos` with a stub DB and asserts every
 * `Repos` field is populated. If a future patch adds a `Repos` field +
 * a `buildRepos()` line without the matching `import`, this test fails
 * at the runtime ReferenceError BEFORE the broken bundle reaches CF.
 *
 * Run: node --import tsx --test src/repositories/__tests__/buildRepos.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildRepos, type Repos } from "../index.js";

describe("buildRepos — dependency-injection wiring", () => {
  it("instantiates every concrete repository", () => {
    // The repositories store a reference to `db` + `now` but don't touch
    // them at construction time, so an empty stub is sufficient to detect
    // a missing-import / undefined-class break.
    const stubDb = {} as never;
    const repos = buildRepos(stubDb);

    // Field list is the canonical Repos surface. Drift from the interface
    // shows up as either a missing field below (interface added without
    // wiring) or an `as keyof Repos` cast error (wired without interface).
    const expected: ReadonlyArray<keyof Repos> = [
      "resumes",
      "resumeFeedback",
      "users",
      "preferences",
      "autofill",
      "jobs",
      "companies",
      "hiringPipeline",
      "subscriptions",
      "tokens",
      "invoices",
      "authTokens",
      "authz",
      "audit",
      "notifications",
      "conversations",
      "followUps",
      "externalEmailAccounts",
      "externalEmailMessages",
      "emailUserRules",
      "emailSyncRuns",
      "media",
      "marketing",
      "platform",
      "studioTemplates",
      "points",
      "contentLocations",
      "geocoderCache",
      "events",
      "coffeeRequests",
      "communityResources",
    ];

    for (const key of expected) {
      assert.ok(
        repos[key] != null,
        `buildRepos() field "${String(key)}" is undefined — likely the concrete class was used without being imported in repositories/index.ts`,
      );
      assert.equal(
        typeof repos[key],
        "object",
        `buildRepos() field "${String(key)}" is not an object instance`,
      );
    }

    // Catch the opposite drift — a key was added to the return without
    // updating the expected list above (or vice versa).
    const actualKeys = Object.keys(repos).sort();
    const expectedSorted = [...expected].map(String).sort();
    assert.deepEqual(
      actualKeys,
      expectedSorted,
      "buildRepos() returned a different set of keys than the canonical list",
    );
  });
});
