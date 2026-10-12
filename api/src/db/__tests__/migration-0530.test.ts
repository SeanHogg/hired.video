/**
 * Migration 0530 (#1804): text_pattern_ops btree on nle_media_sources.bin_folder
 * so POST /api/nle/sources/folders/rename LIKE 'prefix/%' can index-scan.
 *
 * Run: node --import tsx --test src/db/__tests__/migration-0530.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getTableConfig } from "drizzle-orm/pg-core";
import { nleMediaSources } from "../schema/nle.js";

const SQL_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../drizzle/0530_nle_bin_folder_text_pattern.sql",
);
const raw = readFileSync(SQL_PATH, "utf8");
/** Statements only — comments may mention words like "deleted". */
const sql = raw.replace(/--[^\n]*/g, "");

describe("0530_nle_bin_folder_text_pattern.sql", () => {
  it("creates the text_pattern_ops btree on bin_folder idempotently", () => {
    assert.match(
      sql,
      /CREATE INDEX IF NOT EXISTS idx_nle_media_sources_bin_folder_text_pattern\s+ON nle_media_sources \(bin_folder text_pattern_ops\)/,
    );
    assert.doesNotMatch(sql, /gin_trgm_ops/);
    assert.doesNotMatch(sql, /USING gin/i);
  });

  it("changes no data and drops nothing (safe for CI to auto-run)", () => {
    assert.doesNotMatch(sql, /\b(UPDATE|DELETE|DROP|TRUNCATE|INSERT)\b/i);
    assert.doesNotMatch(raw, /@owner-gated/);
    assert.doesNotMatch(sql, /^\s*BEGIN\s*;/m);
    assert.doesNotMatch(sql, /^\s*COMMIT\s*;/m);
    for (const stmt of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)) {
      assert.match(stmt, /IF NOT EXISTS/, `not idempotent: ${stmt.slice(0, 60)}`);
    }
  });

  it("every index it creates is declared in the schema with the same name", () => {
    const declared = new Set(
      getTableConfig(nleMediaSources).indexes.map((i) => i.config.name),
    );
    for (const [, name] of sql.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)/g)) {
      assert.ok(declared.has(name), `${name} is not declared in db/schema/nle.ts`);
    }
    assert.ok(declared.has("idx_nle_media_sources_bin_folder_text_pattern"));
  });
});
