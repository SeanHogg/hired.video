/**
 * Migration 0528 (#2300): posting-agent columns and settings table.
 * Additive only — the publications unique-index swap is 0529 (owner-gated).
 *
 * Run: node --import tsx --test src/services/distribution/__tests__/migration-0528.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getTableConfig } from "drizzle-orm/pg-core";
import { postingAgentSettings, socialPublishJobs } from "../../../db/schema/distribution.js";

const SQL_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../../../drizzle/0528_posting_agent.sql");
const raw = readFileSync(SQL_PATH, "utf8");
const sql = raw.replace(/--[^\n]*/g, "");

describe("0528_posting_agent.sql", () => {
  it("is not owner-gated and does not swap the publications unique", () => {
    assert.doesNotMatch(raw, /@owner-gated/);
    assert.doesNotMatch(sql, /uq_studio_project_publications_proj_dest_variant/);
    assert.doesNotMatch(sql, /DROP INDEX IF EXISTS uq_studio_project_publications_proj_dest/);
  });

  it("does not wrap in BEGIN/COMMIT", () => {
    assert.doesNotMatch(sql, /^\s*BEGIN\s*;/m);
    assert.doesNotMatch(sql, /^\s*COMMIT\s*;/m);
  });

  it("widens status with the schema constraint name", () => {
    assert.match(sql, /DROP CONSTRAINT IF EXISTS social_publish_jobs_status_check/);
    assert.match(sql, /ADD CONSTRAINT social_publish_jobs_status_check/);
    assert.doesNotMatch(sql, /ADD CONSTRAINT chk_social_publish_jobs_status/);
    assert.match(sql, /'draft'/);
    assert.match(sql, /'expired'/);
  });

  it("declares source and caption_source checks under schema names", () => {
    assert.match(sql, /social_publish_jobs_source_check/);
    assert.match(sql, /social_publish_jobs_caption_source_check/);
  });

  it("matches the Drizzle schema for posting_agent_settings types and names", () => {
    assert.match(sql, /destinations varchar\(16\)\[\]/);
    assert.match(sql, /post_minute smallint/);
    assert.match(sql, /quiet_start_minute smallint/);
    assert.match(sql, /quiet_end_minute smallint/);
    assert.match(sql, /idx_posting_agent_settings_enabled_next_plan/);
    assert.match(sql, /posting_agent_settings_mode_check/);
    assert.match(sql, /posting_agent_settings_cadence_check/);
    assert.match(sql, /posting_agent_settings_paused_reason_check/);
  });

  it("every index it creates is declared in the schema with the same name", () => {
    const settings = getTableConfig(postingAgentSettings);
    const jobs = getTableConfig(socialPublishJobs);
    const declared = new Set<string>([
      ...settings.indexes.map((i) => i.config.name),
      ...jobs.indexes.map((i) => i.config.name),
    ]);
    for (const [, name] of sql.matchAll(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS (\w+)/g)) {
      assert.ok(declared.has(name), `${name} is not declared in the Drizzle schema`);
    }
  });
});
