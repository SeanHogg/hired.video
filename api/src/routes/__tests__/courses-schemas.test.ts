/**
 * Tests for the Zod schemas that gate writes to the courses surface.
 *
 * Each schema gets happy / boundary / exception coverage, with explicit
 * regression cases for gap #1522: every ID field must accept the
 * non-RFC-variant UUIDs produced by `md5(slug)::uuid` seed migrations.
 * The bug that motivated this file was a 400 on PATCH
 * `/api/courses/enrollments/:id/progress` because Zod 4's strict
 * `.uuid()` rejected the lessonId — these tests pin the relaxed
 * `UuidLikeSchema` contract so the regression can't sneak back in.
 *
 * Run: node --import tsx --test src/routes/__tests__/courses-schemas.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CreateLessonSchema,
  PrerequisiteSchema,
  ProgressUpdateSchema,
  ScormCommitSchema,
  XapiStatementSchema,
} from "../courses.js";
import {
  SEED_DERIVED_UUID,
  V4_UUID,
} from "../../../../../shared/__tests__/uuid-fixtures.js";

describe("ProgressUpdateSchema", () => {
  // Happy path
  it("accepts the minimal payload (lessonId + status)", () => {
    const r = ProgressUpdateSchema.safeParse({
      lessonId: V4_UUID,
      status: "in_progress",
    });
    assert.equal(r.success, true);
  });

  it("accepts each valid status enum value", () => {
    for (const status of ["not_started", "in_progress", "passed", "failed"] as const) {
      const r = ProgressUpdateSchema.safeParse({ lessonId: V4_UUID, status });
      assert.equal(r.success, true, `status ${status} should parse`);
    }
  });

  it("accepts optional score + time fields", () => {
    const r = ProgressUpdateSchema.safeParse({
      lessonId: V4_UUID,
      status: "passed",
      scoreRaw: 80,
      scoreMax: 100,
      timeSpentSec: 240,
    });
    assert.equal(r.success, true);
  });

  // Regression — the bug that opened #1522
  it("accepts md5-seed-derived lessonId (the bug that opened #1522)", () => {
    const r = ProgressUpdateSchema.safeParse({
      lessonId: SEED_DERIVED_UUID,
      status: "in_progress",
    });
    assert.equal(r.success, true);
  });

  // Exception path
  it("rejects when lessonId is missing", () => {
    assert.equal(
      ProgressUpdateSchema.safeParse({ status: "in_progress" }).success,
      false,
    );
  });

  it("rejects when lessonId is empty string", () => {
    assert.equal(
      ProgressUpdateSchema.safeParse({ lessonId: "", status: "in_progress" }).success,
      false,
    );
  });

  it("rejects malformed lessonId (not 8-4-4-4-12 hex)", () => {
    assert.equal(
      ProgressUpdateSchema.safeParse({ lessonId: "abc-def-ghi", status: "in_progress" }).success,
      false,
    );
  });

  it("rejects unknown status value", () => {
    assert.equal(
      ProgressUpdateSchema.safeParse({ lessonId: V4_UUID, status: "almost_passed" }).success,
      false,
    );
  });

  // Boundary — score fields. Schema doesn't bound score; timeSpent must be ≥0.
  it("rejects negative timeSpentSec", () => {
    assert.equal(
      ProgressUpdateSchema.safeParse({
        lessonId: V4_UUID,
        status: "in_progress",
        timeSpentSec: -1,
      }).success,
      false,
    );
  });

  it("rejects non-integer timeSpentSec", () => {
    assert.equal(
      ProgressUpdateSchema.safeParse({
        lessonId: V4_UUID,
        status: "in_progress",
        timeSpentSec: 12.5,
      }).success,
      false,
    );
  });
});

describe("ScormCommitSchema", () => {
  const valid = {
    lessonId: V4_UUID,
    scormVersion: "1.2" as const,
    cmi: {},
  };

  it("accepts the minimal SCORM commit payload", () => {
    assert.equal(ScormCommitSchema.safeParse(valid).success, true);
  });

  it("accepts md5-seed-derived lessonId (gap #1522 — same root cause)", () => {
    const r = ScormCommitSchema.safeParse({ ...valid, lessonId: SEED_DERIVED_UUID });
    assert.equal(r.success, true);
  });

  it("accepts every SCORM version we support", () => {
    for (const v of ["1.2", "2004_1", "2004_2", "2004_3", "2004_4"] as const) {
      const r = ScormCommitSchema.safeParse({ ...valid, scormVersion: v });
      assert.equal(r.success, true, `version ${v} should parse`);
    }
  });

  it("accepts every documented completionStatus", () => {
    for (const status of [
      "not_attempted",
      "incomplete",
      "completed",
      "passed",
      "failed",
    ] as const) {
      const r = ScormCommitSchema.safeParse({ ...valid, completionStatus: status });
      assert.equal(r.success, true, `completionStatus ${status} should parse`);
    }
  });

  it("rejects unsupported SCORM version", () => {
    assert.equal(
      ScormCommitSchema.safeParse({ ...valid, scormVersion: "3.0" }).success,
      false,
    );
  });

  it("rejects when cmi is missing", () => {
    assert.equal(
      ScormCommitSchema.safeParse({ lessonId: V4_UUID, scormVersion: "1.2" }).success,
      false,
    );
  });

  it("rejects negative totalTimeSec", () => {
    assert.equal(
      ScormCommitSchema.safeParse({ ...valid, totalTimeSec: -5 }).success,
      false,
    );
  });
});

describe("XapiStatementSchema", () => {
  const minimalValid = {
    verb: { id: "http://adlnet.gov/expapi/verbs/completed" },
    object: { id: "urn:hv:lesson:abc" },
  };

  it("accepts the minimal xAPI statement (verb + object)", () => {
    assert.equal(XapiStatementSchema.safeParse(minimalValid).success, true);
  });

  it("accepts md5-seed-derived enrollmentId/lessonId/courseId together", () => {
    const r = XapiStatementSchema.safeParse({
      ...minimalValid,
      enrollmentId: SEED_DERIVED_UUID,
      lessonId: SEED_DERIVED_UUID,
      courseId: SEED_DERIVED_UUID,
    });
    assert.equal(r.success, true);
  });

  it("accepts a fully-populated statement with result + context", () => {
    const r = XapiStatementSchema.safeParse({
      ...minimalValid,
      enrollmentId: V4_UUID,
      lessonId: V4_UUID,
      courseId: V4_UUID,
      result: { score: { raw: 80, scaled: 0.8 }, success: true, completion: true },
      context: { platform: "hired.video" },
      timestamp: "2026-05-26T05:15:27.735Z",
    });
    assert.equal(r.success, true);
  });

  it("rejects when verb.id is missing", () => {
    assert.equal(
      XapiStatementSchema.safeParse({ object: { id: "x" } }).success,
      false,
    );
  });

  it("rejects when verb.id exceeds the 255-char cap", () => {
    const longId = "x".repeat(256);
    assert.equal(
      XapiStatementSchema.safeParse({
        ...minimalValid,
        verb: { id: longId },
      }).success,
      false,
    );
  });

  it("rejects empty object.id", () => {
    assert.equal(
      XapiStatementSchema.safeParse({
        ...minimalValid,
        object: { id: "" },
      }).success,
      false,
    );
  });

  it("rejects when enrollmentId is the wrong shape", () => {
    assert.equal(
      XapiStatementSchema.safeParse({ ...minimalValid, enrollmentId: "not-a-uuid" }).success,
      false,
    );
  });
});

describe("PrerequisiteSchema", () => {
  it("accepts a v4 prerequisiteCourseId", () => {
    assert.equal(
      PrerequisiteSchema.safeParse({ prerequisiteCourseId: V4_UUID }).success,
      true,
    );
  });

  it("accepts an md5-seed-derived prerequisiteCourseId (gap #1522)", () => {
    assert.equal(
      PrerequisiteSchema.safeParse({ prerequisiteCourseId: SEED_DERIVED_UUID }).success,
      true,
    );
  });

  it("rejects when prerequisiteCourseId is missing", () => {
    assert.equal(PrerequisiteSchema.safeParse({}).success, false);
  });

  it("rejects malformed prerequisiteCourseId", () => {
    assert.equal(
      PrerequisiteSchema.safeParse({ prerequisiteCourseId: "abc" }).success,
      false,
    );
  });
});

describe("CreateLessonSchema", () => {
  const valid = {
    title: "Intro to RAG",
    sourceType: "text_md" as const,
  };

  it("accepts the minimal payload (title + sourceType)", () => {
    assert.equal(CreateLessonSchema.safeParse(valid).success, true);
  });

  it("accepts each documented lesson sourceType", () => {
    for (const t of ["text_md", "studio_video", "scorm_package", "external_url"] as const) {
      const r = CreateLessonSchema.safeParse({ ...valid, sourceType: t });
      assert.equal(r.success, true, `sourceType ${t} should parse`);
    }
  });

  it("accepts md5-seed-derived moduleId (gap #1522)", () => {
    const r = CreateLessonSchema.safeParse({ ...valid, moduleId: SEED_DERIVED_UUID });
    assert.equal(r.success, true);
  });

  it("accepts md5-seed-derived scormPkgId + knowledgeCheckFormId", () => {
    const r = CreateLessonSchema.safeParse({
      ...valid,
      sourceType: "scorm_package",
      scormPkgId: SEED_DERIVED_UUID,
      knowledgeCheckFormId: SEED_DERIVED_UUID,
    });
    assert.equal(r.success, true);
  });

  it("rejects empty title", () => {
    assert.equal(
      CreateLessonSchema.safeParse({ ...valid, title: "" }).success,
      false,
    );
  });

  it("rejects title > 255 chars", () => {
    const longTitle = "x".repeat(256);
    assert.equal(
      CreateLessonSchema.safeParse({ ...valid, title: longTitle }).success,
      false,
    );
  });

  it("rejects unknown sourceType", () => {
    assert.equal(
      CreateLessonSchema.safeParse({ ...valid, sourceType: "podcast" }).success,
      false,
    );
  });

  // z.string().url() uses the URL constructor, which accepts unusual schemes
  // like `javascript:` and `data:`. We only check that completely-malformed
  // strings get rejected; surface-level scheme blocking would belong upstream
  // in a dedicated UrlSchema if we ever want it.
  it("rejects clearly-malformed URL fields", () => {
    assert.equal(
      CreateLessonSchema.safeParse({ ...valid, scormEntryUrl: "not a url" }).success,
      false,
    );
    assert.equal(
      CreateLessonSchema.safeParse({ ...valid, externalUrl: "   " }).success,
      false,
    );
  });

  it("rejects estimatedMinutes outside 0..100_000", () => {
    assert.equal(
      CreateLessonSchema.safeParse({ ...valid, estimatedMinutes: -1 }).success,
      false,
    );
    assert.equal(
      CreateLessonSchema.safeParse({ ...valid, estimatedMinutes: 100_001 }).success,
      false,
    );
  });

  it("rejects negative sortOrder", () => {
    assert.equal(
      CreateLessonSchema.safeParse({ ...valid, sortOrder: -1 }).success,
      false,
    );
  });
});
