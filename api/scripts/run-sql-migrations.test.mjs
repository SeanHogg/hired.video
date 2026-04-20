/**
 * Unit tests for splitSqlStatements — the splitter that has quietly broken
 * our migration pipeline twice (0022 sentiment_score, 0008 DO $$ block).
 * Every bug we hit gets a regression test here.
 *
 * Run: node --test api/scripts/run-sql-migrations.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { splitSqlStatements } from "./run-sql-migrations.mjs";

describe("splitSqlStatements", () => {
  it("splits a simple two-statement file", () => {
    const stmts = splitSqlStatements(`CREATE TABLE a (x int); CREATE TABLE b (y int);`);
    assert.deepEqual(stmts, [`CREATE TABLE a (x int)`, `CREATE TABLE b (y int)`]);
  });

  it("preserves a single statement with no trailing semicolon", () => {
    const stmts = splitSqlStatements(`CREATE TABLE a (x int)`);
    assert.deepEqual(stmts, [`CREATE TABLE a (x int)`]);
  });

  it("skips empty statements from trailing semicolons", () => {
    const stmts = splitSqlStatements(`SELECT 1;;;\n`);
    assert.deepEqual(stmts, [`SELECT 1`]);
  });

  // ── Regression: 0022 sentiment_score — semicolon inside a line comment ──
  it("ignores semicolons inside -- line comments (regression: 0022)", () => {
    const sql = `
-- watched_resumes(viewer_id, resume_id); duplicate POST /watch/:id calls
-- are now idempotent at the DB level.
ALTER TABLE resume_information ADD COLUMN sentiment_score integer;
CREATE TABLE resume_views (id uuid);
`;
    const stmts = splitSqlStatements(sql);
    assert.equal(stmts.length, 2, "the ; inside the comment must not split");
    assert.match(stmts[0], /ALTER TABLE resume_information ADD COLUMN sentiment_score/);
    assert.match(stmts[1], /CREATE TABLE resume_views/);
  });

  it("ignores semicolons inside /* block comments */", () => {
    const sql = `
/* first stmt; with ; internal ; semis */
CREATE TABLE a (x int);
/* second; comment */
CREATE TABLE b (y int);
`;
    const stmts = splitSqlStatements(sql);
    assert.equal(stmts.length, 2);
    assert.match(stmts[0], /CREATE TABLE a/);
    assert.match(stmts[1], /CREATE TABLE b/);
  });

  // ── Regression: 0008 voice_clone — DO $$ ... $$ block ──
  it("treats DO $$ ... $$ blocks as a single statement (regression: 0008)", () => {
    const sql = `
DO $$ BEGIN
  ALTER TABLE studio_voice_clones ADD CONSTRAINT studio_voice_clones_listing_slug_key UNIQUE (listing_slug);
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table  THEN NULL;
END $$;

CREATE INDEX idx_voice_visibility ON studio_voice_clones(visibility);
`;
    const stmts = splitSqlStatements(sql);
    assert.equal(stmts.length, 2, "DO block + CREATE INDEX = 2 statements");
    // The DO block must be a single unit including all internal semicolons.
    assert.match(stmts[0], /^DO \$\$/);
    assert.match(stmts[0], /ADD CONSTRAINT.*UNIQUE \(listing_slug\)/);
    assert.match(stmts[0], /EXCEPTION/);
    assert.match(stmts[0], /END \$\$/);
    assert.match(stmts[1], /CREATE INDEX idx_voice_visibility/);
  });

  it("handles tagged dollar-quoted strings like $func$ ... $func$", () => {
    const sql = `
CREATE OR REPLACE FUNCTION f() RETURNS void AS $func$
BEGIN
  RAISE NOTICE 'hi; there';
  PERFORM 1;
END;
$func$ LANGUAGE plpgsql;

SELECT 1;
`;
    const stmts = splitSqlStatements(sql);
    assert.equal(stmts.length, 2);
    assert.match(stmts[0], /CREATE OR REPLACE FUNCTION f/);
    assert.match(stmts[0], /\$func\$ LANGUAGE plpgsql/);
    assert.equal(stmts[1], "SELECT 1");
  });

  it("does not split semicolons inside single-quoted strings", () => {
    const sql = `INSERT INTO t (msg) VALUES ('hello; world'); SELECT 1;`;
    const stmts = splitSqlStatements(sql);
    assert.equal(stmts.length, 2);
    assert.match(stmts[0], /'hello; world'/);
    assert.equal(stmts[1], "SELECT 1");
  });

  it("handles escaped '' inside a single-quoted string", () => {
    const sql = `INSERT INTO t (msg) VALUES ('it''s; fine'); SELECT 1;`;
    const stmts = splitSqlStatements(sql);
    assert.equal(stmts.length, 2);
    assert.match(stmts[0], /'it''s; fine'/);
  });

  it("strips a line comment but keeps the DDL that follows on the next line", () => {
    const sql = `
-- drop dead column
ALTER TABLE a DROP COLUMN x;
`;
    const stmts = splitSqlStatements(sql);
    assert.deepEqual(stmts, [`ALTER TABLE a DROP COLUMN x`]);
  });

  it("keeps a statement that begins with a leading comment block", () => {
    const sql = `
-- Migration: 0024_user_plan_overrides
-- SuperAdmin plan-override sidecar: ...

CREATE TABLE IF NOT EXISTS user_plan_overrides (user_id uuid PRIMARY KEY);
`;
    const stmts = splitSqlStatements(sql);
    assert.equal(stmts.length, 1);
    assert.match(stmts[0], /^CREATE TABLE IF NOT EXISTS user_plan_overrides/);
  });
});
