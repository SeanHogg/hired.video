/**
 * Tests for backup-code generation + consumption.
 *
 * Run: node --import tsx --test src/services/__tests__/backup-codes.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";
import {
  BACKUP_CODE_COUNT,
  generateBackupCodes,
  consumeBackupCode,
  countUnusedBackupCodes,
} from "../auth/backupCodes.js";

function makeDb() {
  return buildFakeDb({
    two_factor_backup_codes: [] as any,
  });
}

describe("backup codes", () => {
  it("generates exactly BACKUP_CODE_COUNT codes", async () => {
    const { db } = makeDb();
    const codes = await generateBackupCodes(db, "user-1");
    assert.equal(codes.length, BACKUP_CODE_COUNT);
  });

  it("produces uniquely-formatted codes", async () => {
    const { db } = makeDb();
    const codes = await generateBackupCodes(db, "user-1");
    const set = new Set(codes);
    assert.equal(set.size, codes.length, "all codes must be distinct");
    for (const code of codes) {
      assert.match(code, /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/, `bad format: ${code}`);
    }
  });

  it("counts every fresh code as unused", async () => {
    const { db } = makeDb();
    await generateBackupCodes(db, "user-1");
    assert.equal(await countUnusedBackupCodes(db, "user-1"), BACKUP_CODE_COUNT);
  });

  it("consumes a valid code exactly once", async () => {
    const { db } = makeDb();
    const codes = await generateBackupCodes(db, "user-1");
    const code = codes[0]!;
    assert.equal(await consumeBackupCode(db, "user-1", code), true);
    assert.equal(await consumeBackupCode(db, "user-1", code), false, "second use must fail");
    assert.equal(await countUnusedBackupCodes(db, "user-1"), BACKUP_CODE_COUNT - 1);
  });

  it("accepts hyphen-stripped + lowercase variants", async () => {
    const { db } = makeDb();
    const codes = await generateBackupCodes(db, "user-1");
    const code = codes[0]!;
    const noHyphen = code.replace(/-/g, "");
    const lower = code.toLowerCase();
    // Stripped form is normalised back to the formatted hash, then matches.
    assert.equal(await consumeBackupCode(db, "user-1", noHyphen), true);
    // After consume, both the original and the lower-case form are now invalid.
    assert.equal(await consumeBackupCode(db, "user-1", lower), false);
  });

  it("rejects an unknown code", async () => {
    const { db } = makeDb();
    await generateBackupCodes(db, "user-1");
    assert.equal(await consumeBackupCode(db, "user-1", "AAAAA-BBBBB"), false);
  });

  it("regenerate invalidates the previous batch", async () => {
    const { db } = makeDb();
    const first = await generateBackupCodes(db, "user-1");
    await generateBackupCodes(db, "user-1");
    assert.equal(
      await consumeBackupCode(db, "user-1", first[0]!),
      false,
      "old code must not work after regenerate",
    );
    assert.equal(await countUnusedBackupCodes(db, "user-1"), BACKUP_CODE_COUNT);
  });

  it("scopes consumption per user", async () => {
    const { db } = makeDb();
    const user1Codes = await generateBackupCodes(db, "user-1");
    await generateBackupCodes(db, "user-2");
    // user-2 cannot use user-1's code.
    assert.equal(await consumeBackupCode(db, "user-2", user1Codes[0]!), false);
  });
});
