/**
 * Tests for the shared resume contract (shared/resume.ts).
 *
 * The contract is the single source of truth for both the Hono API and
 * the React frontend. These tests pin:
 *   - SlugSchema validation rules (solves the "Slug must not look like a
 *     UUID" bug reported on 2026-04-19)
 *   - ResumeContentSchema defaults (no undefined arrays leaking out)
 *   - CreateResumeSchema / UpdateResumeSchema field acceptance
 *   - ResumeSchema / ResumeSummarySchema round-trip
 *
 * Run: node --import tsx --test src/services/__tests__/resume-contract.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SlugSchema,
  ResumeContentSchema,
  CreateResumeSchema,
  UpdateResumeSchema,
  ResumeSchema,
  ResumeSummarySchema,
  ResumePrivacySchema,
} from "../../../../shared/resume.js";

// ═══════════════════════════════════════════════════════════════════════════
// SlugSchema — the root cause of the original 400 bug.
// ═══════════════════════════════════════════════════════════════════════════

describe("SlugSchema", () => {
  it("accepts typical vanity slugs", () => {
    for (const ok of ["john-smith", "ceo-2025", "a-b-c-d", "person123"]) {
      assert.equal(SlugSchema.safeParse(ok).success, true, `should accept "${ok}"`);
    }
  });

  it("rejects UUID-shaped strings (the original bug)", () => {
    const uuid = "235e11c9-0b21-4a97-9cd1-ab3db085b199";
    const result = SlugSchema.safeParse(uuid);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.match(result.error.issues[0].message, /UUID/i);
    }
  });

  it("rejects uppercase, spaces, underscores, and other invalid chars", () => {
    for (const bad of ["John-Smith", "john smith", "john_smith", "john!", "--leading", "trailing-"]) {
      assert.equal(SlugSchema.safeParse(bad).success, false, `should reject "${bad}"`);
    }
  });

  it("rejects too-short and too-long slugs", () => {
    assert.equal(SlugSchema.safeParse("ab").success, false);
    assert.equal(SlugSchema.safeParse("a".repeat(65)).success, false);
  });

  it("rejects double hyphens", () => {
    assert.equal(SlugSchema.safeParse("john--smith").success, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ResumeContentSchema — the JSON Resume document stored in content jsonb.
// ═══════════════════════════════════════════════════════════════════════════

describe("ResumeContentSchema", () => {
  it("accepts the empty document and fills default empty arrays", () => {
    const parsed = ResumeContentSchema.parse({});
    assert.deepEqual(parsed.work, []);
    assert.deepEqual(parsed.education, []);
    assert.deepEqual(parsed.skills, []);
    assert.deepEqual(parsed.volunteer, []);
    assert.deepEqual(parsed.awards, []);
    assert.deepEqual(parsed.certificates, []);
    assert.deepEqual(parsed.publications, []);
    assert.deepEqual(parsed.languages, []);
    assert.deepEqual(parsed.interests, []);
    assert.deepEqual(parsed.references, []);
    assert.deepEqual(parsed.projects, []);
    assert.deepEqual(parsed.metaData, []);
  });

  it("accepts a well-formed JSON Resume document", () => {
    const doc = {
      basics: { name: "Sean", email: "s@h.com", summary: "CTO" },
      work: [{ name: "Acme", position: "CTO", startDate: "2020-01", endDate: "Present", highlights: ["Built it"] }],
      skills: [{ name: "Languages", keywords: ["TS", "Go"] }],
    };
    const parsed = ResumeContentSchema.safeParse(doc);
    assert.equal(parsed.success, true);
  });

  it("fills missing fields on partial section entries", () => {
    // A work entry with only `name` and `position` should still parse,
    // with sane defaults for the remaining fields. Keeps the UI builder
    // from having to hand-initialise every field.
    const parsed = ResumeContentSchema.parse({
      work: [{ name: "Acme", position: "CTO" }],
    });
    assert.equal(parsed.work?.[0]?.startDate, "");
    assert.equal(parsed.work?.[0]?.endDate, "");
    assert.deepEqual(parsed.work?.[0]?.highlights, []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CreateResumeSchema
// ═══════════════════════════════════════════════════════════════════════════

describe("CreateResumeSchema", () => {
  it("accepts minimum payload (title only)", () => {
    const parsed = CreateResumeSchema.safeParse({ title: "My Resume" });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.status, "draft");
      assert.equal(parsed.data.privacy, "private");
      assert.equal(parsed.data.isMaster, false);
    }
  });

  it("rejects empty titles", () => {
    assert.equal(CreateResumeSchema.safeParse({ title: "" }).success, false);
  });

  it("validates slug when provided", () => {
    // UUID slug rejected (the original bug path, now at the schema layer).
    const uuidResult = CreateResumeSchema.safeParse({
      title: "My Resume",
      slug: "235e11c9-0b21-4a97-9cd1-ab3db085b199",
    });
    assert.equal(uuidResult.success, false);

    const ok = CreateResumeSchema.safeParse({ title: "My Resume", slug: "my-resume" });
    assert.equal(ok.success, true);
  });

  it("accepts rawText for AI parsing path", () => {
    const parsed = CreateResumeSchema.safeParse({
      title: "My Resume",
      rawText: "Sean Hogg\nCTO at Acme\n...",
    });
    assert.equal(parsed.success, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UpdateResumeSchema
// ═══════════════════════════════════════════════════════════════════════════

describe("UpdateResumeSchema", () => {
  it("accepts partial updates", () => {
    assert.equal(UpdateResumeSchema.safeParse({ title: "Renamed" }).success, true);
    assert.equal(UpdateResumeSchema.safeParse({ isMaster: true }).success, true);
    assert.equal(UpdateResumeSchema.safeParse({ privacy: "public" }).success, true);
  });

  it("accepts slug in body (not query param)", () => {
    // This is the structural fix: slug is metadata on the resume, so it
    // belongs in the body alongside title/privacy/isMaster.
    const parsed = UpdateResumeSchema.safeParse({ slug: "my-new-slug" });
    assert.equal(parsed.success, true);
  });

  it("rejects a UUID-shaped slug in body (schema-level validation)", () => {
    const parsed = UpdateResumeSchema.safeParse({
      slug: "235e11c9-0b21-4a97-9cd1-ab3db085b199",
    });
    assert.equal(parsed.success, false);
  });

  it("accepts explicit null slug to clear a custom slug", () => {
    const parsed = UpdateResumeSchema.safeParse({ slug: null });
    assert.equal(parsed.success, true);
  });

  it("accepts parentId: null for detach; rejects non-null parentId", () => {
    assert.equal(UpdateResumeSchema.safeParse({ parentId: null }).success, true);
    assert.equal(
      UpdateResumeSchema.safeParse({ parentId: "some-uuid" as any }).success,
      false,
      "non-null parentId must go through the variation endpoint",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ResumeSchema — envelope
// ═══════════════════════════════════════════════════════════════════════════

describe("ResumeSchema", () => {
  const base = {
    id: "11111111-1111-1111-1111-111111111111",
    userId: "22222222-2222-2222-2222-222222222222",
    title: "My Resume",
    slug: "my-resume",
    content: ResumeContentSchema.parse({}),
    status: "draft" as const,
    privacy: "private" as const,
    isMaster: false,
    isActive: false,
    parentId: null,
    diffPercent: null,
    templateId: null,
    metaResumeId: null,
    sentimentScore: null,
    viewCount: 0,
    isOwner: false,
    isWatched: false,
    createdAt: "2026-04-19T00:00:00.000Z",
    updatedAt: "2026-04-19T00:00:00.000Z",
  };

  it("accepts a complete envelope", () => {
    assert.equal(ResumeSchema.safeParse(base).success, true);
  });

  it("requires the per-viewer computed fields", () => {
    const { isWatched, ...missing } = base;
    void isWatched;
    assert.equal(ResumeSchema.safeParse(missing).success, false);
  });

  it("requires a non-negative integer viewCount", () => {
    assert.equal(ResumeSchema.safeParse({ ...base, viewCount: -1 }).success, false);
    assert.equal(ResumeSchema.safeParse({ ...base, viewCount: 1.5 }).success, false);
  });

  it("allows slug to be null (clean resumes with no vanity URL)", () => {
    assert.equal(ResumeSchema.safeParse({ ...base, slug: null }).success, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ResumePrivacySchema
// ═══════════════════════════════════════════════════════════════════════════

describe("ResumePrivacySchema", () => {
  it("accepts the five legal values", () => {
    for (const p of ["public", "recruiter_only", "connections", "private", "draft"]) {
      assert.equal(ResumePrivacySchema.safeParse(p).success, true);
    }
  });

  it("rejects unknown values (e.g. legacy numeric codes)", () => {
    assert.equal(ResumePrivacySchema.safeParse(0 as any).success, false);
    assert.equal(ResumePrivacySchema.safeParse("everyone").success, false);
  });
});
