/**
 * Engagement row access (#1586 follow-up): chapters, video forms, review links,
 * comments and thumbnails are managed by whoever may act on the row's PROJECT (owner,
 * company member, delegate), not only the user who created the row.
 * Unknown, malformed and forbidden rows resolve to null (the routes 404).
 *
 * The rule runs against a port fake seeded with production-shaped rows: a
 * personal project (Alice, with a delegated studio grant to her coach) and
 * a company project (Acme, Bob is a member). The fake's canActFor mirrors
 * services/studio/workspace.ts: self only on a personal project, members on
 * a company project, and delegates via an active grant.
 *
 * Run: node --import tsx --test src/services/studio/__tests__/engagement-row-access.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveActableEngagementRow, type EngagementRowAccessSource } from "../engagement-row-access.js";
import { findEngagementRowProject } from "../../../repositories/studioEngagementRowRepository.js";
import type { Db } from "../../../db/index.js";

const ALICE = "5b0c7a9e-1f43-4c4e-9a51-2d7f3c1e8a10";
const COACH = "0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6";
const BOB = "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f";
const MALLORY = "9e2d4f61-7a8b-4c3d-8e9f-0a1b2c3d4e5f";
const ACME = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

const ALICE_PROJECT = "7d3e2f10-4b5a-4c6d-8e9f-0a1b2c3d4e5f";
const ACME_PROJECT = "11111111-1111-4111-8111-111111111111";

const ALICE_FORM = "3f6c1d2e-8a41-4b6f-9a0e-2d5c7b9e1a44";
const ACME_CHAPTER = "a2b9e4c1-5d7f-4e2a-8c3b-6f1d0e9a7b55";
const ALICE_THUMB = "c4d5e6f7-0819-4a2b-9c3d-4e5f60718293";
const ALICE_REVIEW_LINK = "d5e6f708-192a-4b3c-8d4e-5f6071829304";
const ACME_COMMENT = "e1f2a3b4-c5d6-4e7f-8091-a2b3c4d5e6f7";

function source(): EngagementRowAccessSource & { canActCalls: number } {
  const rows = new Map([
    [`form:${ALICE_FORM}`, { projectId: ALICE_PROJECT, ownerUserId: ALICE, ownerCompanyId: null }],
    [`thumbnail:${ALICE_THUMB}`, { projectId: ALICE_PROJECT, ownerUserId: ALICE, ownerCompanyId: null }],
    // Created by Alice while at Acme, but the PROJECT is Acme's.
    [`chapter:${ACME_CHAPTER}`, { projectId: ACME_PROJECT, ownerUserId: ALICE, ownerCompanyId: ACME }],
    [`review-link:${ALICE_REVIEW_LINK}`, { projectId: ALICE_PROJECT, ownerUserId: ALICE, ownerCompanyId: null }],
    [`comment:${ACME_COMMENT}`, { projectId: ACME_PROJECT, ownerUserId: ALICE, ownerCompanyId: ACME }],
  ]);
  const companyMembers = new Map([[ACME, new Set([BOB, ALICE])]]);
  const grants = new Map([[ALICE, new Set([COACH])]]);
  return {
    canActCalls: 0,
    async findRowProject(kind, rowId) {
      return rows.get(`${kind}:${rowId}`) ?? null;
    },
    async canActFor(actor, ownerUserId, ownerCompanyId) {
      this.canActCalls += 1;
      if (actor === ownerUserId && ownerCompanyId == null) return true;
      if (ownerCompanyId && companyMembers.get(ownerCompanyId)?.has(actor)) return true;
      return ownerUserId !== actor && (grants.get(ownerUserId)?.has(actor) ?? false);
    },
  };
}

describe("resolveActableEngagementRow", () => {
  it("lets the owner manage their form and returns its project", async () => {
    assert.deepEqual(await resolveActableEngagementRow(ALICE, "form", ALICE_FORM, source()), { projectId: ALICE_PROJECT });
  });

  it("lets a delegate with a studio grant manage the owner's thumbnail", async () => {
    assert.deepEqual(await resolveActableEngagementRow(COACH, "thumbnail", ALICE_THUMB, source()), { projectId: ALICE_PROJECT });
  });

  it("lets a company member manage a chapter another member created", async () => {
    assert.deepEqual(await resolveActableEngagementRow(BOB, "chapter", ACME_CHAPTER, source()), { projectId: ACME_PROJECT });
  });

  it("refuses a stranger (→ 404)", async () => {
    assert.equal(await resolveActableEngagementRow(MALLORY, "form", ALICE_FORM, source()), null);
    assert.equal(await resolveActableEngagementRow(MALLORY, "chapter", ACME_CHAPTER, source()), null);
  });

  it("refuses the right id under the wrong kind (a form id is not a chapter)", async () => {
    assert.equal(await resolveActableEngagementRow(ALICE, "chapter", ALICE_FORM, source()), null);
  });

  it("answers an unknown row like a forbidden one, without an access check", async () => {
    const src = source();
    assert.equal(await resolveActableEngagementRow(ALICE, "form", "77777777-7777-4777-8777-777777777777", src), null);
    assert.equal(src.canActCalls, 0);
  });

  it("refuses a missing actor without a lookup", async () => {
    const src = source();
    assert.equal(await resolveActableEngagementRow(undefined, "form", ALICE_FORM, src), null);
    assert.equal(src.canActCalls, 0);
  });
});

describe("resolveActableEngagementRow — review links and comments", () => {
  it("lets the owner and her delegate revoke a review link", async () => {
    assert.deepEqual(await resolveActableEngagementRow(ALICE, "review-link", ALICE_REVIEW_LINK, source()), { projectId: ALICE_PROJECT });
    assert.deepEqual(await resolveActableEngagementRow(COACH, "review-link", ALICE_REVIEW_LINK, source()), { projectId: ALICE_PROJECT });
  });

  it("refuses a stranger revoking someone else's review link (→ 404)", async () => {
    assert.equal(await resolveActableEngagementRow(MALLORY, "review-link", ALICE_REVIEW_LINK, source()), null);
    assert.equal(await resolveActableEngagementRow(BOB, "review-link", ALICE_REVIEW_LINK, source()), null);
  });

  it("lets a company member resolve a comment on the company project", async () => {
    assert.deepEqual(await resolveActableEngagementRow(BOB, "comment", ACME_COMMENT, source()), { projectId: ACME_PROJECT });
  });

  it("refuses a stranger on a comment, and an anonymous caller without a lookup", async () => {
    const src = source();
    assert.equal(await resolveActableEngagementRow(MALLORY, "comment", ACME_COMMENT, src), null);
    assert.equal(await resolveActableEngagementRow(undefined, "comment", ACME_COMMENT, src), null);
    assert.equal(src.canActCalls, 1);
  });
});

describe("findEngagementRowProject", () => {
  /** Any query reaching this db fails the test. */
  const untouchableDb = new Proxy({}, {
    get() {
      throw new Error("database must not be queried for a malformed id");
    },
  }) as unknown as Db;

  it("answers null for a malformed row id without querying", async () => {
    for (const id of ["", "new", "not-a-uuid", `${ALICE_FORM}x`]) {
      assert.equal(await findEngagementRowProject(untouchableDb, "form", id), null);
      assert.equal(await findEngagementRowProject(untouchableDb, "review-link", id), null);
    }
  });
});
