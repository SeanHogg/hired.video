/**
 * Tests for the pure resume serializers that the route handlers call.
 *
 * These encode the clean API contract defined in shared/resume.ts:
 *   - `rowToResume(row, extras)`      — full resume + content
 *   - `rowToResumeSummary(row, extras)` — list shape, content omitted
 *
 * Both are pure: they take a DB row plus precomputed viewer-context extras
 * (isOwner/isWatched/viewCount) and produce the wire shape. The handlers
 * compute extras separately (watched_resumes join + resume_views count)
 * and pass them in. This keeps serialization testable without a DB.
 *
 * Run: node --import tsx --test src/routes/__tests__/resume-serializers.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { rowToResume, rowToResumeSummary } from "../resumes.js";
import { ResumeSchema, ResumeSummarySchema } from "../../../../shared/resume.js";

// ---------------------------------------------------------------------------
// Test fixture — the fields of resume_information the serializers actually
// read. Cast through `any` to sidestep the full Drizzle-inferred type.
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<Record<string, unknown>> = {}): any {
  const now = new Date("2026-04-15T00:00:00Z");
  return {
    id: "11111111-1111-1111-1111-111111111111",
    userId: "22222222-2222-2222-2222-222222222222",
    title: "Senior Engineer Resume",
    slug: "senior-engineer",
    content: {
      basics: {
        name: "Sean Hogg",
        label: "CTO",
        summary: "25 years of experience.",
        email: "sean@example.com",
      },
      work: [],
      education: [],
      skills: [],
    },
    status: "draft",
    privacyLevel: 0,
    isMaster: true,
    isActive: true,
    parentId: null,
    diffPercent: null,
    templateId: null,
    metaResumeId: null,
    sentimentScore: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const noExtras = { isOwner: false, isWatched: false, viewCount: 0 };

// ═══════════════════════════════════════════════════════════════════════════
// rowToResume
// ═══════════════════════════════════════════════════════════════════════════

describe("rowToResume", () => {
  it("produces a shape that passes ResumeSchema", () => {
    const resume = rowToResume(makeRow(), noExtras);
    const parsed = ResumeSchema.safeParse(resume);
    assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  });

  it("maps DB columns to canonical field names (no legacy shim)", () => {
    const resume = rowToResume(makeRow({ title: "My Resume" }), noExtras);
    assert.equal(resume.title, "My Resume");        // was `name`
    assert.equal(typeof resume.content, "object");  // was `data`
    assert.ok("createdAt" in resume);               // no creationDateTime duplicate
    assert.ok(!("creationDateTime" in (resume as any)));
    assert.ok(!("updateDateTime" in (resume as any)));
    assert.ok(!("resumeSerialized" in (resume as any)));
    assert.ok(!("metaResume" in (resume as any)));
    assert.ok(!("privacy_ShowResume" in (resume as any)));
    assert.ok(!("description" in (resume as any)));
    assert.ok(!("isPrimaryDefault" in (resume as any)));
    assert.ok(!("sentimentScore" in (resume as any)) || resume.sentimentScore !== undefined);
  });

  it("maps privacyLevel integer → privacy string", () => {
    assert.equal(rowToResume(makeRow({ privacyLevel: 0 }), noExtras).privacy, "public");
    assert.equal(rowToResume(makeRow({ privacyLevel: 1 }), noExtras).privacy, "recruiter_only");
    assert.equal(rowToResume(makeRow({ privacyLevel: 2 }), noExtras).privacy, "connections");
    assert.equal(rowToResume(makeRow({ privacyLevel: 10 }), noExtras).privacy, "private");
  });

  it("returns slug as null when the row has no custom slug (no UUID fallback)", () => {
    const resume = rowToResume(makeRow({ slug: null }), noExtras);
    assert.equal(resume.slug, null);
  });

  it("preserves a user-chosen slug", () => {
    const resume = rowToResume(makeRow({ slug: "john-doe-cto" }), noExtras);
    assert.equal(resume.slug, "john-doe-cto");
  });

  it("carries extras into the response (isOwner/isWatched/viewCount)", () => {
    const resume = rowToResume(makeRow(), { isOwner: true, isWatched: true, viewCount: 42 });
    assert.equal(resume.isOwner, true);
    assert.equal(resume.isWatched, true);
    assert.equal(resume.viewCount, 42);
  });

  it("surfaces the persisted sentiment score (null by default)", () => {
    assert.equal(rowToResume(makeRow(), noExtras).sentimentScore, null);
    assert.equal(rowToResume(makeRow({ sentimentScore: 78 }), noExtras).sentimentScore, 78);
  });

  it("emits createdAt/updatedAt as ISO strings", () => {
    const resume = rowToResume(makeRow(), noExtras);
    assert.match(resume.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.match(resume.updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("normalises PascalCase content at serialization time (legacy row safety net)", () => {
    // Legacy rows written before the camelCase migration may still hold
    // PascalCase keys. The serializer normalises so the wire format stays
    // canonical regardless of storage state.
    const row = makeRow({
      content: {
        Basics: { Name: "Old Sean", Summary: "Pascal legacy" },
        Work: [{ Name: "Acme", Position: "CTO", StartDate: "2020-01", EndDate: "Present", Highlights: ["Shipped it"] }],
      },
    });
    const resume = rowToResume(row, noExtras);
    assert.equal(resume.content.basics?.name, "Old Sean");
    assert.equal(resume.content.basics?.summary, "Pascal legacy");
    assert.equal(resume.content.work?.[0]?.name, "Acme");
    assert.equal(resume.content.work?.[0]?.position, "CTO");
    assert.deepEqual(resume.content.work?.[0]?.highlights, ["Shipped it"]);
    // No PascalCase keys leak into the output.
    assert.ok(!("Basics" in resume.content));
    assert.ok(!("Work" in resume.content));
  });

  it("defaults missing content to an empty JSON Resume document", () => {
    const resume = rowToResume(makeRow({ content: {} }), noExtras);
    assert.deepEqual(resume.content.work, []);
    assert.deepEqual(resume.content.education, []);
    assert.deepEqual(resume.content.skills, []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// rowToResumeSummary
// ═══════════════════════════════════════════════════════════════════════════

describe("rowToResumeSummary", () => {
  it("produces a shape that passes ResumeSummarySchema", () => {
    const summary = rowToResumeSummary(makeRow(), noExtras);
    const parsed = ResumeSummarySchema.safeParse(summary);
    assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  });

  it("omits the full content blob to keep list responses small", () => {
    const summary = rowToResumeSummary(makeRow(), noExtras);
    assert.ok(!("content" in (summary as any)));
  });

  it("surfaces headline (basics.label) and summary (basics.summary)", () => {
    const summary = rowToResumeSummary(
      makeRow({ content: { basics: { label: "CTO", summary: "Loves React." } } }),
      noExtras,
    );
    assert.equal(summary.headline, "CTO");
    assert.equal(summary.summary, "Loves React.");
  });

  it("tolerates PascalCase-only rows for headline/summary extraction", () => {
    const summary = rowToResumeSummary(
      makeRow({ content: { Basics: { Label: "CEO", Summary: "Kind of nice." } } }),
      noExtras,
    );
    assert.equal(summary.headline, "CEO");
    assert.equal(summary.summary, "Kind of nice.");
  });

  it("falls back to empty string when basics is missing", () => {
    const summary = rowToResumeSummary(makeRow({ content: {} }), noExtras);
    assert.equal(summary.headline, "");
    assert.equal(summary.summary, "");
  });
});
