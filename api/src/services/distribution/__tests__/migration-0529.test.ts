/**
 * Migration 0529 (#2300 R14): publications unique includes render_variant_id.
 * Owner-gated because the unique-index swap fails on duplicates.
 *
 * Run: node --import tsx --test src/services/distribution/__tests__/migration-0529.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getTableConfig } from "drizzle-orm/pg-core";
import { studioProjectPublications } from "../../../db/schema/studioPublications.js";

const SQL_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../drizzle/0529_publications_variant_unique.sql",
);
const raw = readFileSync(SQL_PATH, "utf8");
const sql = raw.replace(/--[^\n]*/g, "");

describe("0529_publications_variant_unique.sql", () => {
  it("is owner-gated and carries a duplicate-audit query", () => {
    assert.match(raw, /@owner-gated/);
    assert.match(raw, /GROUP BY 1, 2, 3/);
    assert.match(raw, /HAVING COUNT\(\*\) > 1/);
  });

  it("does not wrap in BEGIN/COMMIT", () => {
    assert.doesNotMatch(sql, /^\s*BEGIN\s*;/m);
    assert.doesNotMatch(sql, /^\s*COMMIT\s*;/m);
  });

  it("adds the new publications unique constraint before dropping the old index", () => {
    const addAt = sql.indexOf("uq_studio_project_publications_proj_dest_variant");
    const dropAt = sql.indexOf("DROP INDEX IF EXISTS uq_studio_project_publications_proj_dest;");
    assert.ok(addAt >= 0 && dropAt > addAt, "add variant constraint before dropping the 2-col index");
    assert.match(sql, /UNIQUE NULLS NOT DISTINCT \(project_id, destination, render_variant_id\)/);
  });

  it("matches the Drizzle schema unique name and columns (NULLS NOT DISTINCT stays SQL-owned, see 0532)", () => {
    const pubs = getTableConfig(studioProjectPublications);
    const variant = pubs.uniqueConstraints.find(
      (u) => u.getName() === "uq_studio_project_publications_proj_dest_variant",
    );
    assert.ok(variant, "variant unique is not declared on studioProjectPublications");
    assert.deepEqual(variant.columns.map((c) => c.name), ["project_id", "destination", "render_variant_id"]);
  });
});

describe("0532_publications_unique_nulls_not_distinct.sql", () => {
  const raw0532 = readFileSync(join(dirname(SQL_PATH), "0532_publications_unique_nulls_not_distinct.sql"), "utf8");
  const sql0532 = raw0532.replace(/--[^\n]*/g, "");

  it("only rebuilds a constraint that is not yet NULLS NOT DISTINCT", () => {
    assert.match(sql0532, /AND NOT i\.indnullsnotdistinct/);
    assert.match(sql0532, /UNIQUE NULLS NOT DISTINCT \(project_id, destination, render_variant_id\)/);
  });

  it("raises on duplicates instead of deleting rows", () => {
    assert.match(sql0532, /RAISE EXCEPTION/);
    assert.doesNotMatch(sql0532, /\bDELETE\b|\bTRUNCATE\b/i);
  });
});
