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
  ResumeWithOwnershipSchema,
} from "../../../../shared/resume.js";
import {
  rowToResume,
  rowToResumeSummary,
  EMPTY_VIEWER_EXTRAS,
} from "../../routes/resumes.js";

// ═══════════════════════════════════════════════════════════════════════════
// SlugSchema — the root cause of the original 400 bug.
// ═══════════════════════════════════════════════════════════════════════════

describe("SlugSchema", () => {
  it("accepts typical vanity slugs", () => {
    for (const ok of ["john-smith", "ceo-2025", "a-b-c-d", "person123"]) {
      assert.equal(SlugSchema.safeParse(ok).success, true, `should accept "${ok}"`);
    }
  });

  it("accepts UUID-shaped strings (new resumes are seeded with slug = id)", () => {
    const uuid = "235e11c9-0b21-4a97-9cd1-ab3db085b199";
    const result = SlugSchema.safeParse(uuid);
    assert.equal(result.success, true);
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
  it("accepts the empty document and fills default empty arrays for every section", () => {
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
  });

  it("leaves metaData undefined when absent (not defaulted to []) — avoids wiping stored media on update", () => {
    // metaData is intentionally optional-without-default so PUT /:id
    // can distinguish "caller omitted metaData" (preserve stored value)
    // from "caller sent metaData:[]" (explicit clear). A default would
    // silently wipe media attachments.
    const parsed = ResumeContentSchema.parse({});
    assert.equal(parsed.metaData, undefined);

    const withExplicitEmpty = ResumeContentSchema.parse({ metaData: [] });
    assert.deepEqual(withExplicitEmpty.metaData, []);
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
    // UUID-shaped slugs are accepted because new resumes are seeded with
    // slug = id so the row always has a stable URL segment.
    const uuidResult = CreateResumeSchema.safeParse({
      title: "My Resume",
      slug: "235e11c9-0b21-4a97-9cd1-ab3db085b199",
    });
    assert.equal(uuidResult.success, true);

    const ok = CreateResumeSchema.safeParse({ title: "My Resume", slug: "my-resume" });
    assert.equal(ok.success, true);

    const bad = CreateResumeSchema.safeParse({ title: "My Resume", slug: "Not Valid" });
    assert.equal(bad.success, false);
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

  it("accepts a UUID-shaped slug in body (new resumes are seeded with slug = id)", () => {
    const parsed = UpdateResumeSchema.safeParse({
      slug: "235e11c9-0b21-4a97-9cd1-ab3db085b199",
    });
    assert.equal(parsed.success, true);
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

// ═══════════════════════════════════════════════════════════════════════════
// Wire-format contract
//
// These tests are the guardrail that was missing on 2026-04-20: the
// backend serializers (`rowToResume`, `rowToResumeSummary`) must emit
// objects that parse cleanly against the shared Zod schemas the frontend
// uses to validate responses. If a serializer drops a field, renames it,
// or returns the wrong nullability, the list/detail pages silently fall
// through to a broken fallback — the original bug was the frontend
// requiring `name`/`views` while the backend sent `title`/`viewCount`.
//
// Anyone editing rowToResume[*] should re-run this file first.
// ═══════════════════════════════════════════════════════════════════════════

function makeDbRow(overrides: Partial<any> = {}): any {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    userId: "owner-1",
    title: "My Resume",
    slug: "my-resume",
    content: {
      basics: { name: "Sean", label: "Founder", summary: "Summary" },
      work: [],
    },
    status: "draft",
    privacyLevel: 10,
    isMaster: false,
    isActive: false,
    parentId: null,
    diffPercent: null,
    templateId: null,
    metaResumeId: null,
    sentimentScore: null,
    createdAt: new Date("2026-04-15T00:00:00Z"),
    updatedAt: new Date("2026-04-15T00:00:00Z"),
    ...overrides,
  };
}

describe("wire contract: rowToResume → ResumeSchema", () => {
  it("round-trips a normal row", () => {
    const dto = rowToResume(makeDbRow(), EMPTY_VIEWER_EXTRAS);
    const parsed = ResumeSchema.safeParse(dto);
    assert.equal(parsed.success, true,
      parsed.success ? "" : JSON.stringify(parsed.error.issues, null, 2));
  });

  it("accepts null slug (new resumes created without one)", () => {
    const dto = rowToResume(makeDbRow({ slug: null }), EMPTY_VIEWER_EXTRAS);
    const parsed = ResumeSchema.safeParse(dto);
    assert.equal(parsed.success, true);
  });

  it("rejects output missing any required canonical field — early-warns on drift", () => {
    const dto = rowToResume(makeDbRow(), EMPTY_VIEWER_EXTRAS) as any;
    for (const field of [
      "id", "userId", "title", "slug", "status", "privacy",
      "isMaster", "isActive", "viewCount", "isOwner", "isWatched",
      "createdAt", "updatedAt",
    ]) {
      const bad = { ...dto };
      delete bad[field];
      const parsed = ResumeSchema.safeParse(bad);
      assert.equal(
        parsed.success, false,
        `dropping "${field}" should break schema validation (catches wire drift)`,
      );
    }
  });
});

describe("wire contract: rowToResumeSummary → ResumeSummarySchema + ResumeWithOwnershipSchema", () => {
  it("summary parses cleanly (this is what the Resumes list page receives)", () => {
    const summary = rowToResumeSummary(makeDbRow(), EMPTY_VIEWER_EXTRAS);
    const parsed = ResumeSummarySchema.safeParse(summary);
    assert.equal(parsed.success, true,
      parsed.success ? "" : JSON.stringify(parsed.error.issues, null, 2));
  });

  it("summary + ownership:'owned' parses as ResumeWithOwnership (this is /withownership)", () => {
    const summary = rowToResumeSummary(makeDbRow(), EMPTY_VIEWER_EXTRAS);
    const withOwnership = { ...summary, ownership: "owned" as const };
    const parsed = ResumeWithOwnershipSchema.safeParse(withOwnership);
    assert.equal(parsed.success, true,
      parsed.success ? "" : JSON.stringify(parsed.error.issues, null, 2));
  });

  it("summary includes the two card-rendering fields (title + headline + summary)", () => {
    const summary = rowToResumeSummary(makeDbRow(), EMPTY_VIEWER_EXTRAS) as any;
    // This is the check that would've caught the 2026-04-20 blank-title bug.
    assert.equal(typeof summary.title, "string", "must have title field (NOT 'name')");
    assert.equal(typeof summary.viewCount, "number", "must have viewCount field (NOT 'views')");
    assert.equal(summary.title, "My Resume");
    assert.equal(summary.headline, "Founder");
    assert.equal(summary.summary, "Summary");
  });
});
