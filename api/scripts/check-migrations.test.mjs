import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  duplicateNumberViolations,
  unnumberedViolations,
  liveMigrationIndexes,
  indexDrift,
  ratchet,
  sqlFiles,
} from "./check-migrations.mjs";

describe("check-migrations — file naming", () => {
  it("flags a reused number but not the frozen historical duplicates", () => {
    const files = ["0072_a.sql", "0072_b.sql", "0545_x.sql", "0545_y.sql", "0546_z.sql"];
    assert.deepEqual(duplicateNumberViolations(files, new Set(["0072"])), ["0545: 0545_x.sql, 0545_y.sql"]);
  });

  it("treats a letter suffix as the same number (0121b shares 0121)", () => {
    assert.deepEqual(duplicateNumberViolations(["0121_a.sql", "0121b_b.sql"], new Set()), ["0121: 0121_a.sql, 0121b_b.sql"]);
  });

  it("flags unnumbered files except the allow-listed legacy one", () => {
    assert.deepEqual(
      unnumberedViolations(["0001_a.sql", "add_saved_jobs_status.sql", "fix_things.sql"], new Set(["add_saved_jobs_status.sql"])),
      ["fix_things.sql"],
    );
  });

  it("passes on the real drizzle/ directory", () => {
    const files = sqlFiles();
    assert.deepEqual(duplicateNumberViolations(files), []);
    assert.deepEqual(unnumberedViolations(files), []);
  });
});

describe("check-migrations — index replay", () => {
  it("creates, drops, renames and follows table drops / archives", () => {
    const live = liveMigrationIndexes([
      {
        name: "0001.sql",
        sql: `CREATE INDEX IF NOT EXISTS idx_a ON "public"."t1" (x);
CREATE UNIQUE INDEX CONCURRENTLY uq_b ON t2 (y);
CREATE INDEX idx_c ON t3 (z); -- CREATE INDEX not_this ON t9 (q)
CREATE INDEX idx_d ON t4 (z);
CREATE INDEX idx_e ON t5 (z);`,
      },
      {
        name: "0002.sql",
        sql: `DROP INDEX IF EXISTS idx_a;
ALTER INDEX uq_b RENAME TO uq_b2;
DROP TABLE IF EXISTS t3;
ALTER TABLE IF EXISTS public.t4 SET SCHEMA archive;
ALTER TABLE t5 RENAME TO t6;`,
      },
    ]);
    assert.deepEqual([...live].sort(), [["idx_e", "t6"], ["uq_b2", "t2"]]);
  });

  it("reports drift in both directions, only for push-managed tables", () => {
    const declared = new Map([["idx_declared_only", "t1"], ["idx_both", "t1"]]);
    const live = new Map([["idx_both", "t1"], ["idx_mig_only", "t1"], ["idx_sql_table", "not_declared"]]);
    assert.deepEqual(indexDrift(declared, live, new Set(["t1"])), {
      schemaOnly: ["t1.idx_declared_only"],
      migrationOnly: ["t1.idx_mig_only"],
    });
  });

  it("ratchets: new entries fail, fixed ones are reported stale", () => {
    assert.deepEqual(ratchet(["a", "c"], ["a", "b"]), { added: ["c"], stale: ["b"] });
  });
});
