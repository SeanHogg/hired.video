/**
 * Unit tests for the pure helpers in routes/resumes.ts.
 *
 * Covers:
 * - rowToSummary: public-resume DTO shape (IsOwner, Description from Basics.Summary,
 *   Privacy/IsMaster/IsActive/ParentId, Slug fallback)
 * - preserveMetaData: carry-forward of content.metaData across content updates so
 *   resume edits don't wipe associated media attachments
 *
 * Run: node --import tsx --test src/routes/__tests__/resumes.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { rowToSummary, preserveMetaData } from "../resumes.js";

// ---------------------------------------------------------------------------
// Test fixture — a minimal shape matching `typeof resumes.$inferSelect` for the
// fields rowToSummary actually reads. Cast through `any` to sidestep the full
// Drizzle-inferred type without pulling the schema into the test.
// ---------------------------------------------------------------------------
function makeRow(overrides: Partial<Record<string, unknown>> = {}): any {
  const now = new Date("2026-04-15T00:00:00Z");
  return {
    id: "resume-1",
    userId: "user-1",
    title: "Sean Hogg Resume",
    slug: "sean-hogg",
    content: {
      basics: {
        summary: "CTO and Technology Leader with 25 years of experience.",
      },
      metaData: [{ id: "m1", metaType: 1, url: "https://example.com/video.mp4" }],
    },
    privacyLevel: 0,
    isMaster: true,
    isActive: false,
    parentId: null,
    createdAt: now,
    updatedAt: now,
    status: "published",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// rowToSummary
// ═══════════════════════════════════════════════════════════════════════════
describe("rowToSummary", () => {
  it("populates Description from Basics.Summary (lowercase key)", () => {
    const dto = rowToSummary(makeRow());
    assert.equal(
      dto.Description,
      "CTO and Technology Leader with 25 years of experience.",
    );
  });

  it("populates Description from Basics.Summary (PascalCase key)", () => {
    const dto = rowToSummary(
      makeRow({ content: { Basics: { Summary: "Pascal summary" } } }),
    );
    assert.equal(dto.Description, "Pascal summary");
  });

  it("returns empty Description when Basics.Summary is missing", () => {
    const dto = rowToSummary(makeRow({ content: {} }));
    assert.equal(dto.Description, "");
  });

  it("sets IsOwner=true when currentUserId matches row.userId", () => {
    const dto = rowToSummary(makeRow(), "user-1");
    assert.equal(dto.IsOwner, true);
  });

  it("sets IsOwner=false when currentUserId does not match", () => {
    const dto = rowToSummary(makeRow(), "someone-else");
    assert.equal(dto.IsOwner, false);
  });

  it("sets IsOwner=false for anonymous callers (no currentUserId)", () => {
    const dto = rowToSummary(makeRow());
    assert.equal(dto.IsOwner, false);
  });

  it("maps privacyLevel to a string Privacy field", () => {
    assert.equal(rowToSummary(makeRow({ privacyLevel: 0 })).Privacy, "public");
    assert.equal(
      rowToSummary(makeRow({ privacyLevel: 1 })).Privacy,
      "recruiter_only",
    );
    assert.equal(
      rowToSummary(makeRow({ privacyLevel: 2 })).Privacy,
      "connections",
    );
    assert.equal(rowToSummary(makeRow({ privacyLevel: 10 })).Privacy, "private");
  });

  it("sets IsPublic=true only when privacyLevel is 0", () => {
    assert.equal(rowToSummary(makeRow({ privacyLevel: 0 })).IsPublic, true);
    assert.equal(rowToSummary(makeRow({ privacyLevel: 1 })).IsPublic, false);
    assert.equal(rowToSummary(makeRow({ privacyLevel: 10 })).IsPublic, false);
  });

  it("carries IsMaster / IsActive / ParentId through verbatim", () => {
    const dto = rowToSummary(
      makeRow({ isMaster: true, isActive: true, parentId: "parent-1" }),
    );
    assert.equal(dto.IsMaster, true);
    assert.equal(dto.IsActive, true);
    assert.equal(dto.ParentId, "parent-1");
  });

  it("falls back to row.id when slug is null", () => {
    const dto = rowToSummary(makeRow({ slug: null }));
    assert.equal(dto.Slug, "resume-1");
  });

  it("emits createdAt + updatedAt as ISO strings", () => {
    const dto = rowToSummary(makeRow());
    assert.ok(
      typeof dto.CreationDateTimeFormatted === "string" &&
        dto.CreationDateTimeFormatted.endsWith("Z"),
    );
    assert.ok(
      typeof dto.UpdatedAt === "string" && dto.UpdatedAt.endsWith("Z"),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// preserveMetaData
// ═══════════════════════════════════════════════════════════════════════════
describe("preserveMetaData", () => {
  const existingMetaData = [
    { id: "m1", metaType: 1, url: "https://example.com/video.mp4" },
  ];

  it("carries existing metaData forward when caller omits it", () => {
    const next = { basics: { summary: "updated" } };
    const merged = preserveMetaData(next, existingMetaData) as Record<string, unknown>;
    assert.deepEqual(merged.metaData, existingMetaData);
    assert.deepEqual((merged.basics as any).summary, "updated");
  });

  it("respects an explicit metaData from the caller", () => {
    const overrideMedia = [{ id: "m2", metaType: 2, url: "new.png" }];
    const next = { basics: { summary: "x" }, metaData: overrideMedia };
    const merged = preserveMetaData(next, existingMetaData) as Record<string, unknown>;
    assert.deepEqual(merged.metaData, overrideMedia);
  });

  it("respects an explicit empty metaData array (intentional clear)", () => {
    const next = { basics: { summary: "x" }, metaData: [] };
    const merged = preserveMetaData(next, existingMetaData) as Record<string, unknown>;
    assert.deepEqual(merged.metaData, []);
  });

  it("returns content unchanged when there is no existing metaData", () => {
    const next = { basics: { summary: "x" } };
    const merged = preserveMetaData(next, undefined);
    assert.equal(merged, next);
  });

  it("passes through non-object content verbatim", () => {
    assert.equal(preserveMetaData(null, existingMetaData), null);
    assert.equal(preserveMetaData(undefined, existingMetaData), undefined);
    assert.equal(preserveMetaData("raw pdf text", existingMetaData), "raw pdf text");
  });

  it("does not mutate the incoming content object", () => {
    const next = { basics: { summary: "x" } };
    preserveMetaData(next, existingMetaData);
    assert.equal((next as Record<string, unknown>).metaData, undefined);
  });
});
