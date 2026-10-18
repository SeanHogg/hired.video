/**
 * Card-view job reads skip the body columns only when the response
 * projection cannot carry any body-derived field.
 *
 * Run: node --import tsx --test src/repositories/__tests__/job-list-columns.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getTableColumns } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { JOB_BODY_DTO_KEYS, jobItemCardColumns, projectionOmitsJobBody } from "../jobListColumns.js";
import { JOB_LIST_FIELDS, parseFields } from "../../../../shared/projection.js";

describe("projectionOmitsJobBody", () => {
  it("omits the body for the default card projection the frontend sends", () => {
    assert.equal(projectionOmitsJobBody(parseFields("id,title,company,location,salaryMin", JOB_LIST_FIELDS)), true);
  });

  it("never omits it without a projection (full row) — boundary", () => {
    assert.equal(projectionOmitsJobBody(null), false);
    assert.equal(projectionOmitsJobBody([]), false);
  });

  it("keeps the body when any body-derived key is requested", () => {
    for (const key of JOB_BODY_DTO_KEYS) assert.equal(projectionOmitsJobBody(["id", key]), false, key);
  });
});

describe("jobItemCardColumns", () => {
  it("keeps every job_items key so rowToJob sees the same row shape", () => {
    assert.deepEqual(Object.keys(jobItemCardColumns).sort(), Object.keys(getTableColumns(schema.jobItems)).sort());
  });

  it("blanks description and details in SQL instead of selecting them", () => {
    assert.notEqual(jobItemCardColumns.description, schema.jobItems.description);
    assert.notEqual(jobItemCardColumns.details, schema.jobItems.details);
    assert.equal(jobItemCardColumns.title, schema.jobItems.title);
  });
});
