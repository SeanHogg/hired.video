/**
 * Mig 0523 — partial UNIQUE index on boost_checkouts.provider_payment_id.
 * It must be safe to auto-run against production data that may already
 * hold duplicate payment ids: create only when absent AND duplicate-free,
 * otherwise NOTICE and skip; never DELETE / UPDATE.
 *
 * Run: node --import tsx --test src/services/advertising/__tests__/boost-payment-unique-migration.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const migration = readFileSync(join(API_ROOT, "drizzle", "0523_boost_payment_unique.sql"), "utf8");
const schemaSrc = readFileSync(join(API_ROOT, "src", "db", "schema", "advertising.ts"), "utf8");
const code = migration.replace(/--[^\n]*/g, "");
const NAME = "uq_boost_checkouts_provider_payment_id";

describe("0523 boost payment unique index", () => {
  it("never deletes or rewrites rows", () => {
    assert.doesNotMatch(code, /\bDELETE\b/i);
    assert.doesNotMatch(code, /\bUPDATE\b/i);
    assert.doesNotMatch(code, /\bTRUNCATE\b|\bDROP\b/i);
  });

  it("is idempotent: returns early when the index exists, and creates IF NOT EXISTS", () => {
    assert.match(code, new RegExp(`IF EXISTS \\([\\s\\S]*?pg_indexes[\\s\\S]*?indexname = '${NAME}'[\\s\\S]*?RETURN;`));
    assert.match(code, new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS ${NAME}`));
  });

  it("guards on duplicates: counts them, NOTICEs and skips before any CREATE", () => {
    const dupCheck = code.search(/HAVING count\(\*\) > 1/);
    const skip = code.search(/IF dup_ids > 0 THEN[\s\S]*?RAISE NOTICE[\s\S]*?RETURN;/);
    const create = code.search(/CREATE UNIQUE INDEX/);
    assert.ok(dupCheck > 0 && skip > dupCheck && create > skip, "duplicate check → notice/skip → create, in that order");
    assert.match(code, /WHERE provider_payment_id IS NOT NULL\s+GROUP BY provider_payment_id/);
  });

  it("is a partial index over non-null ids, declared in the schema under the same name", () => {
    assert.match(code, /ON boost_checkouts \(provider_payment_id\)\s+WHERE provider_payment_id IS NOT NULL;/);
    assert.match(schemaSrc, new RegExp(`uniqueIndex\\("${NAME}"\\)[\\s\\S]*?\\.on\\(t\\.providerPaymentId\\)[\\s\\S]*?IS NOT NULL`));
  });
});
