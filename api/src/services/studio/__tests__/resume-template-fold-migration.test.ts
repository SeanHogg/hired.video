/**
 * Guards the facts mig 0520 (résumé templates → studio templates) hard-codes
 * against their single sources, so they can't drift:
 *   • the document_kind CHECK (migration + Drizzle schema) lists exactly
 *     DOCUMENT_ENTITY_KINDS (shared/document-entity-kinds.ts);
 *   • the built-in résumé preset ids it protects from slug re-pointing are
 *     exactly RESUME_TEMPLATE_LISTINGS (shared/marketplace-template-listings.ts);
 *   • it keeps ids (reviews / tool_runs reference them) and never drops the
 *     legacy table (push runs before the SQL migrations).
 *
 * Run: node --import tsx --test src/services/studio/__tests__/resume-template-fold-migration.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCUMENT_ENTITY_KINDS } from "../../../../../shared/document-entity-kinds.js";
import { RESUME_TEMPLATE_LISTINGS } from "../../../../../shared/marketplace-template-listings.js";

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const migration = readFileSync(join(API_ROOT, "drizzle", "0520_fold_resume_templates_into_studio_templates.sql"), "utf8");
const schema = readFileSync(join(API_ROOT, "src", "db", "schema", "studiotemplates.ts"), "utf8");

/** The newest migration that (re)defines the document_kind CHECK — 0520 added
 *  it; a later one widens it when a document kind is added (company, #1915).
 *  Applied migrations are never edited, so the live list is the last one. */
const CHECK_SQL = /CHECK \(document_kind IS NULL OR document_kind/;
const latestDocumentKindMigration = readdirSync(join(API_ROOT, "drizzle"))
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort()
  .map((f) => readFileSync(join(API_ROOT, "drizzle", f), "utf8"))
  .filter((sql) => CHECK_SQL.test(sql))
  .at(-1)!;

/** The quoted values of the first `<anchor> … IN (…)` list after `anchor`. */
function inList(text: string, anchor: RegExp): string[] {
  const match = text.match(new RegExp(`${anchor.source}[\\s\\S]*?IN \\(([^)]*)\\)`));
  assert.ok(match, `no IN list after ${anchor}`);
  return [...match[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

describe("0520 document_kind CHECK", () => {
  it("matches DOCUMENT_ENTITY_KINDS in the newest migration defining it", () => {
    assert.deepEqual(inList(latestDocumentKindMigration, CHECK_SQL), [...DOCUMENT_ENTITY_KINDS]);
  });

  it("matches DOCUMENT_ENTITY_KINDS in the Drizzle schema, under the same constraint name", () => {
    assert.match(schema, /"studio_templates_document_kind_check"/);
    assert.match(migration, /studio_templates_document_kind_check/);
    assert.deepEqual(inList(schema, /studio_templates_document_kind_check/), [...DOCUMENT_ENTITY_KINDS]);
  });
});

describe("0520 license re-pointing", () => {
  it("protects exactly the built-in résumé preset ids", () => {
    const protectedIds = inList(migration, /l\.template_id NOT/);
    assert.deepEqual([...protectedIds].sort(), RESUME_TEMPLATE_LISTINGS.map((l) => l.slug).sort());
  });
});

describe("0520 copy", () => {
  it("keeps each legacy row's id and is re-runnable", () => {
    assert.match(migration, /INSERT INTO studio_templates \(\s*id,/);
    assert.match(migration, /ON CONFLICT \(id\) DO NOTHING/);
  });

  it("does not drop resume_templates (push runs before SQL migrations)", () => {
    const sql = migration.replace(/--[^\n]*/g, "");
    assert.doesNotMatch(sql, /DROP TABLE/i);
  });
});
