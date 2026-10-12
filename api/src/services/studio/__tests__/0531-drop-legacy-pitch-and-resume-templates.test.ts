/**
 * Guards mig 0531 (second-deploy cleanup, #2385) against its sources:
 *   • SQL drops users.video_pitch_url / video_pitch_set_at and the
 *     resume_templates table, then points tool_runs.template_id at
 *     studio_templates(id) ON DELETE CASCADE;
 *   • Drizzle no longer declares those columns / that table, so the next
 *     `drizzle-kit push --force` cannot recreate them empty;
 *   • the unique-index registry no longer targets a dropped table.
 *
 * Run: node --import tsx --test src/services/studio/__tests__/0531-drop-legacy-pitch-and-resume-templates.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const sql = readFileSync(
  join(API_ROOT, "drizzle", "0531_drop_legacy_pitch_columns_and_resume_templates.sql"),
  "utf8",
);
const usersSchema = readFileSync(join(API_ROOT, "src", "db", "schema", "users.ts"), "utf8");
const resumesSchema = readFileSync(join(API_ROOT, "src", "db", "schema", "resumes.ts"), "utf8");
const toolRunsSchema = readFileSync(join(API_ROOT, "src", "db", "schema", "tool-runs.ts"), "utf8");
const uniqueIndexRegistry = readFileSync(
  join(API_ROOT, "scripts", "unique-index-registry.mjs"),
  "utf8",
);

const sqlNoComments = sql.replace(/--[^\n]*/g, "");

describe("0531 SQL", () => {
  it("refuses to run unless 0519 and 0520 have already copied the data", () => {
    assert.match(sql, /0519 has not added studio_projects\.is_current_pitch/);
    assert.match(sql, /0520 has not added studio_templates\.document_kind/);
    assert.match(sql, /RAISE EXCEPTION/);
  });

  it("drops the legacy pitch columns and resume_templates table", () => {
    assert.match(sqlNoComments, /DROP COLUMN IF EXISTS video_pitch_url/i);
    assert.match(sqlNoComments, /DROP COLUMN IF EXISTS video_pitch_set_at/i);
    assert.match(sqlNoComments, /DROP TABLE IF EXISTS resume_templates/i);
  });

  it("adds tool_runs.template_id → studio_templates(id) ON DELETE CASCADE", () => {
    assert.match(sqlNoComments, /tool_runs_template_id_studio_templates_id_fk/);
    assert.match(
      sqlNoComments,
      /FOREIGN KEY \(template_id\) REFERENCES studio_templates\(id\) ON DELETE CASCADE/i,
    );
  });

  it("nulls orphan tool_runs.template_id before adding the FK", () => {
    const nullOrphansAt = sqlNoComments.search(/UPDATE tool_runs[\s\S]*template_id = NULL/i);
    const addFkAt = sqlNoComments.search(/ADD CONSTRAINT tool_runs_template_id_studio_templates_id_fk/i);
    assert.ok(nullOrphansAt >= 0, "expected orphan-null UPDATE");
    assert.ok(addFkAt > nullOrphansAt, "FK must come after orphan-clean");
  });
});

describe("0531 schema deletions (so push cannot recreate empties)", () => {
  it("users.ts no longer declares videoPitchUrl / videoPitchSetAt", () => {
    assert.doesNotMatch(usersSchema, /videoPitchUrl/);
    assert.doesNotMatch(usersSchema, /video_pitch_url/);
    assert.doesNotMatch(usersSchema, /videoPitchSetAt/);
    assert.doesNotMatch(usersSchema, /video_pitch_set_at/);
  });

  it("resumes.ts no longer declares the resumeTemplates table", () => {
    assert.doesNotMatch(resumesSchema, /resumeTemplates/);
    assert.doesNotMatch(resumesSchema, /pgTable\(\s*"resume_templates"/);
  });

  it("does not declare the studio_templates FK on tool_runs in this deploy", () => {
    // push runs before SQL; a schema .references() here would try the FK
    // before 0531 nulls orphans.
    assert.doesNotMatch(toolRunsSchema, /templateId: uuid\("template_id"\)\.references\(/);
  });
});

describe("0531 unique-index registry", () => {
  it("no longer lists uq_resume_templates_listing_slug", () => {
    assert.doesNotMatch(uniqueIndexRegistry, /uq_resume_templates_listing_slug/);
    assert.doesNotMatch(uniqueIndexRegistry, /table:\s*"resume_templates"/);
  });
});
