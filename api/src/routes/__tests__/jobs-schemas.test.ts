/**
 * Tests for the Zod schemas that gate writes to the jobs surface.
 *
 * Covers:
 *   • CreateJobSchema   — required fields for a new job posting
 *   • UpdateJobSchema   — partial updates, all fields optional
 *   • JobAlertSchema    — saved search alert validation
 *
 * Run: node --import tsx --test src/routes/__tests__/jobs-schemas.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CreateJobSchema,
  UpdateJobSchema,
  JobAlertSchema,
} from "../jobs.js";

describe("CreateJobSchema", () => {
  it("accepts minimum required payload (title + description)", () => {
    const r = CreateJobSchema.safeParse({
      title: "Senior Engineer",
      description: "We're hiring",
    });
    assert.equal(r.success, true);
  });

  it("accepts optional location", () => {
    const r = CreateJobSchema.safeParse({
      title: "Senior Engineer",
      description: "We're hiring",
      location: "Remote",
    });
    assert.equal(r.success, true);
  });

  it("rejects empty title", () => {
    assert.equal(
      CreateJobSchema.safeParse({ title: "", description: "x" }).success,
      false,
    );
  });

  it("rejects empty description", () => {
    assert.equal(
      CreateJobSchema.safeParse({ title: "x", description: "" }).success,
      false,
    );
  });

  it("rejects missing fields", () => {
    assert.equal(CreateJobSchema.safeParse({}).success, false);
    assert.equal(CreateJobSchema.safeParse({ title: "x" }).success, false);
    assert.equal(CreateJobSchema.safeParse({ description: "x" }).success, false);
  });
});

describe("UpdateJobSchema", () => {
  it("accepts partial updates (any single field)", () => {
    assert.equal(UpdateJobSchema.safeParse({ title: "New Title" }).success, true);
    assert.equal(UpdateJobSchema.safeParse({ description: "New desc" }).success, true);
    assert.equal(UpdateJobSchema.safeParse({ location: "NYC" }).success, true);
  });

  it("accepts empty object (no-op update)", () => {
    assert.equal(UpdateJobSchema.safeParse({}).success, true);
  });

  it("rejects empty string on fields that have min(1) in the parent schema", () => {
    assert.equal(UpdateJobSchema.safeParse({ title: "" }).success, false);
    assert.equal(UpdateJobSchema.safeParse({ description: "" }).success, false);
  });
});

describe("JobAlertSchema", () => {
  it("requires a name", () => {
    assert.equal(JobAlertSchema.safeParse({}).success, false);
    assert.equal(JobAlertSchema.safeParse({ name: "" }).success, false);
  });

  it("accepts a minimum payload (name only)", () => {
    assert.equal(JobAlertSchema.safeParse({ name: "Remote Rust jobs" }).success, true);
  });

  it("accepts the full keyword / location / jobType / frequency payload", () => {
    const r = JobAlertSchema.safeParse({
      name: "Remote Rust jobs",
      keywords: "rust, systems",
      location: "Remote",
      jobType: "full-time",
      frequency: "daily",
    });
    assert.equal(r.success, true);
  });

  it("accepts the three legal frequency values", () => {
    for (const frequency of ["daily", "weekly", "monthly"]) {
      const r = JobAlertSchema.safeParse({ name: "x", frequency });
      assert.equal(r.success, true, frequency);
    }
  });

  it("rejects unknown frequency values", () => {
    assert.equal(
      JobAlertSchema.safeParse({ name: "x", frequency: "hourly" }).success,
      false,
    );
  });
});
