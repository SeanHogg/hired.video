/**
 * publicUserColumns / accountTeamRepository — client-reachable users reads
 * never project credentials, and Team Members paging is clamped.
 *
 * Run: node --import tsx --test src/repositories/__tests__/user-columns.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { publicUserColumns, USER_SECRET_SQL_COLUMNS } from "../userColumns.js";
import {
  ACCOUNT_TEAM_PAGE_DEFAULT,
  ACCOUNT_TEAM_PAGE_MAX,
  accountTeamInvitationColumns,
  accountTeamUserColumns,
  clampAccountTeamPage,
} from "../accountTeamRepository.js";

const sqlNames = (cols: Record<string, { name: string }>) => Object.values(cols).map((c) => c.name);

describe("publicUserColumns", () => {
  it("excludes every secret column", () => {
    const names = sqlNames(publicUserColumns);
    for (const secret of USER_SECRET_SQL_COLUMNS) assert.ok(!names.includes(secret), secret);
  });

  it("keeps the identity columns DTOs read", () => {
    for (const key of ["id", "email", "name", "role", "isActive", "mfaEnabled", "externalPublicHandle", "createdAt"]) {
      assert.ok(key in publicUserColumns, key);
    }
  });
});

describe("accountTeamRepository projections", () => {
  it("Team Members user rows carry no secret column", () => {
    const names = sqlNames(accountTeamUserColumns);
    for (const secret of USER_SECRET_SQL_COLUMNS) assert.ok(!names.includes(secret), secret);
  });

  it("invitation rows never carry the accept token", () => {
    assert.ok(!sqlNames(accountTeamInvitationColumns).includes("token"));
  });
});

describe("clampAccountTeamPage", () => {
  it("defaults when nothing (or NaN from a missing query param) is passed", () => {
    assert.deepEqual(clampAccountTeamPage(), { limit: ACCOUNT_TEAM_PAGE_DEFAULT, offset: 0 });
    assert.deepEqual(clampAccountTeamPage({ limit: Number.NaN, offset: Number.NaN }), { limit: ACCOUNT_TEAM_PAGE_DEFAULT, offset: 0 });
  });

  it("caps the page size (boundary)", () => {
    assert.equal(clampAccountTeamPage({ limit: 10_000 }).limit, ACCOUNT_TEAM_PAGE_MAX);
    assert.equal(clampAccountTeamPage({ limit: ACCOUNT_TEAM_PAGE_MAX }).limit, ACCOUNT_TEAM_PAGE_MAX);
  });

  it("rejects negative / zero values (exception path)", () => {
    assert.deepEqual(clampAccountTeamPage({ limit: -5, offset: -1 }), { limit: ACCOUNT_TEAM_PAGE_DEFAULT, offset: 0 });
    assert.deepEqual(clampAccountTeamPage({ limit: 25.7, offset: 50.2 }), { limit: 25, offset: 50 });
  });
});
