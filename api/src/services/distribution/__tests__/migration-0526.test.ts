/**
 * Migration 0526 (#2048): the publications (destination, external_id)
 * index and the `published_by` poster column are additive, idempotent and
 * safe to auto-run, and every index is declared in the Drizzle schema
 * under the same name (CI `drizzle-kit push` drops undeclared ones).
 *
 * Run: node --import tsx --test src/services/distribution/__tests__/migration-0526.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getTableConfig } from "drizzle-orm/pg-core";
import { studioProjectPublications } from "../../../db/schema/studioPublications.js";

const SQL_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../../../drizzle/0526_publications_dest_external_idx.sql");
const raw = readFileSync(SQL_PATH, "utf8");
/** Statements only — comments may mention words like "deleted". */
const sql = raw.replace(/--[^\n]*/g, "");

describe("0526_publications_dest_external_idx.sql", () => {
  it("creates the lookup index and the poster column idempotently", () => {
    assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_studio_project_publications_dest_external\s+ON studio_project_publications \(destination, external_id\)/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES users\(id\) ON DELETE SET NULL/);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_studio_project_publications_published_by/);
  });

  it("changes no data and drops nothing (safe for CI to auto-run)", () => {
    // (the FK's "ON DELETE SET NULL" is a rule, not a statement)
    assert.doesNotMatch(sql.replace(/ON DELETE SET NULL/gi, ""), /\b(UPDATE|DELETE|DROP|TRUNCATE|INSERT)\b/i);
    assert.doesNotMatch(raw, /@owner-gated/);
    for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      assert.match(stmt, /IF NOT EXISTS/, `not idempotent: ${stmt.slice(0, 60)}`);
    }
  });

  it("every index it creates is declared in the schema with the same name", () => {
    const declared = new Set(getTableConfig(studioProjectPublications).indexes.map((i) => i.config.name));
    for (const [, name] of sql.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)/g)) {
      assert.ok(declared.has(name), `${name} is not declared in db/schema/studioPublications.ts`);
    }
    assert.ok(getTableConfig(studioProjectPublications).columns.some((c) => c.name === "published_by"));
  });
});
