/**
 * W3-D2 status vocabulary: every lifecycle CHECK declared in the Drizzle
 * schema lists exactly the shared/statuses.ts (or shared/lists.ts) set, so
 * the database, the API writers and the frontend badges cannot drift.
 *
 * Run: node --import tsx --test src/db/__tests__/status-vocabulary-schema.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { userConnections } from "../schema/users.js";
import { candidateSubmissions, placements } from "../schema/recruiter.js";
import { videos } from "../schema/videos.js";
import { jobApplications } from "../schema/jobs.js";
import { lists, listItems } from "../schema/lists.js";
import {
  APPLICATION_STATUSES,
  COMMISSION_STATUSES,
  CONNECTION_STATUSES,
  LEGACY_SUBMISSION_STATUS_MAP,
  SUBMISSION_STATUSES,
  VIDEO_STATUSES,
  parseStatus,
} from "../../../../shared/statuses.js";
import { LIST_ITEM_ENTITY_TYPES, LIST_KINDS } from "../../../../shared/lists.js";

/** The quoted values inside a declared CHECK's `IN (...)` list. */
function checkValues(table: PgTable, name: string): string[] {
  const chk = getTableConfig(table).checks.find((c) => c.name === name);
  assert.ok(chk, `check ${name} declared`);
  const chunks = (chk.value as unknown as { queryChunks: unknown[] }).queryChunks;
  const text = chunks
    .map((c) => (c && typeof c === "object" && "value" in c ? (c as { value: string[] }).value.join("") : ""))
    .join("");
  return [...text.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("status vocabulary CHECKs match shared registries", () => {
  const cases: Array<[PgTable, string, readonly string[]]> = [
    [userConnections, "user_connections_status_check", CONNECTION_STATUSES],
    [candidateSubmissions, "candidate_submissions_status_check", SUBMISSION_STATUSES],
    [placements, "placements_commission_status_check", COMMISSION_STATUSES],
    [videos, "videos_status_check", VIDEO_STATUSES],
    [jobApplications, "job_applications_status_check", APPLICATION_STATUSES],
    [lists, "lists_kind_check", LIST_KINDS],
    [listItems, "list_items_entity_type_check", LIST_ITEM_ENTITY_TYPES],
  ];
  for (const [table, name, values] of cases) {
    it(name, () => assert.deepEqual(checkValues(table, name), [...values]));
  }
});

describe("parseStatus", () => {
  it("lowercases and accepts canonical values", () => {
    assert.equal(parseStatus(SUBMISSION_STATUSES, " Submitted ", "submitted"), "submitted");
    assert.equal(parseStatus(COMMISSION_STATUSES, "Paid", "pending"), "paid");
  });
  it("maps legacy aliases", () => {
    assert.equal(parseStatus(SUBMISSION_STATUSES, "Phone Screen", "submitted", LEGACY_SUBMISSION_STATUS_MAP), "screening");
    assert.equal(parseStatus(SUBMISSION_STATUSES, "Offer Extended", "submitted", LEGACY_SUBMISSION_STATUS_MAP), "offer");
  });
  it("falls back on junk and non-strings", () => {
    assert.equal(parseStatus(COMMISSION_STATUSES, "bogus", "pending"), "pending");
    assert.equal(parseStatus(COMMISSION_STATUSES, 42, "pending"), "pending");
    assert.equal(parseStatus(COMMISSION_STATUSES, undefined, "pending"), "pending");
  });
});
