/**
 * Tests for the clean passthrough behavior of ResumeService.
 *
 * Encodes the post-refactor contract:
 *   - The backend now returns the canonical `Resume` shape defined in
 *     shared/resume.ts (title, content, slug nullable, viewCount, etc.).
 *   - The frontend service validates with ResumeSchema and passes the
 *     response through. No more transformApiResumeToResume shim.
 *
 * These tests use the mocked apiClient from the shared test setup.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { z } from "zod";

import { resumeService } from "../services/resume-service";
import { ResumeSchema } from "@shared/resume";
import { apiClient } from "../api-client";

vi.mock("../api-client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
  },
}));

const mockedApi = apiClient as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
};

function makeCleanResume(overrides: Partial<z.infer<typeof ResumeSchema>> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    userId: "22222222-2222-2222-2222-222222222222",
    title: "Senior Engineer Resume",
    slug: "senior-engineer",
    content: {
      basics: { name: "Sean Hogg", label: "CTO", summary: "25 years." },
      work: [],
      education: [],
      volunteer: [],
      awards: [],
      certificates: [],
      publications: [],
      skills: [],
      languages: [],
      interests: [],
      references: [],
      projects: [],
      metaData: [],
    },
    status: "draft" as const,
    privacy: "private" as const,
    isMaster: true,
    isActive: true,
    parentId: null,
    diffPercent: null,
    templateId: null,
    metaResumeId: null,
    sentimentScore: null,
    viewCount: 0,
    isOwner: true,
    isWatched: false,
    createdAt: "2026-04-19T00:00:00.000Z",
    updatedAt: "2026-04-19T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResumeService.getResumeById — passthrough", () => {
  it("returns the clean Resume shape unchanged from the API", async () => {
    const clean = makeCleanResume({ slug: "my-resume" });
    mockedApi.get.mockResolvedValue({ data: clean });

    const result = await resumeService.getResumeById(clean.id);

    expect(result).toEqual(clean);
    expect(result.title).toBe("Senior Engineer Resume");
    expect(result.slug).toBe("my-resume");
    expect(result.content.basics?.name).toBe("Sean Hogg");
  });

  it("preserves viewer-specific fields (isWatched, isOwner, viewCount)", async () => {
    const clean = makeCleanResume({ isWatched: true, viewCount: 42 });
    mockedApi.get.mockResolvedValue({ data: clean });

    const result = await resumeService.getResumeById(clean.id);

    expect(result.isWatched).toBe(true);
    expect(result.viewCount).toBe(42);
    expect(result.isOwner).toBe(true);
  });

  it("preserves persisted sentimentScore from the API", async () => {
    const clean = makeCleanResume({ sentimentScore: 78 });
    mockedApi.get.mockResolvedValue({ data: clean });

    const result = await resumeService.getResumeById(clean.id);

    expect(result.sentimentScore).toBe(78);
  });

  it("allows slug to be null (resume without a vanity URL)", async () => {
    const clean = makeCleanResume({ slug: null });
    mockedApi.get.mockResolvedValue({ data: clean });

    const result = await resumeService.getResumeById(clean.id);

    expect(result.slug).toBeNull();
  });
});

describe("ResumeService.updateResumeData — sends slug in body, not query string", () => {
  it("sends slug as a body field, never as a query param (fixes 2026-04-19 bug)", async () => {
    mockedApi.put.mockResolvedValue({ data: makeCleanResume() });

    await resumeService.updateResumeData("resume-id", {
      name: "New Title",
      slug: "my-new-slug",
      privacy: "public",
    });

    expect(mockedApi.put).toHaveBeenCalledTimes(1);
    const [url, body] = mockedApi.put.mock.calls[0];
    // URL no longer has ?slug=... query string
    expect(url).toBe("/api/resumes/resume-id");
    expect(url).not.toMatch(/\?slug=/);
    // slug now lives in the body
    expect((body as any).slug).toBe("my-new-slug");
    expect((body as any).title).toBe("New Title");
    expect((body as any).privacy).toBe("public");
  });

  it("does not include slug in body when caller omits it (no UUID round-trip)", async () => {
    mockedApi.put.mockResolvedValue({ data: makeCleanResume() });

    await resumeService.updateResumeData("resume-id", {
      name: "Just renaming",
    });

    const [, body] = mockedApi.put.mock.calls[0];
    expect("slug" in (body as Record<string, unknown>)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Schema-identity regression tests
//
// The original bug: `resume-service.ts` re-defined a 250-line `ResumeSchema`
// locally, drifting from the shared `ResumeSchema` in @shared/resume. The
// backend returned the canonical shape, but the service validated with
// its legacy local copy (fields like `name`, `description`, `resumeSerialized`,
// `privacy_ShowResume`, `privacy_ShowContactDetails`, `creationDateTime`).
// Validation failed on every successful upload with "expected string/number,
// received undefined" × 6.
//
// These tests pin the "service re-export === shared canonical" equivalence
// so a future contributor who re-introduces a local schema breaks CI.
// ═══════════════════════════════════════════════════════════════════════════

describe("ResumeSchema identity: service re-export === shared canonical", () => {
  it("the ResumeSchema exported from resume-service IS the shared schema (===)", async () => {
    const { ResumeSchema: ServiceResumeSchema } = await import(
      "../services/resume-service"
    );
    const { ResumeSchema: SharedResumeSchema } = await import(
      "@shared/resume"
    );
    expect(ServiceResumeSchema).toBe(SharedResumeSchema);
  });

  it("the canonical schema parses a real backend response — no 'expected string, received undefined' drift", () => {
    // Exact shape from the 2026-04-20 upload response the user reported.
    // If this test fails again, a local schema has been re-introduced.
    const realBackendResponse = {
      id: "b5c1d53d-8aab-4077-b026-4691533e6824",
      userId: "5715588f-148d-4606-b5ab-eadef7cbaf43",
      title: "JsonResume-Sean Hogg-2025-07-05",
      slug: null,
      content: {
        work: [],
        awards: [],
        basics: {
          url: "",
          name: "Sean",
          email: "s@s.com",
          image: "",
          label: "CTO",
          phone: "1",
          summary: "x",
          location: null,
        },
        skills: [],
        projects: [],
        education: [],
        interests: [],
        languages: [],
        volunteer: [],
        references: [],
        certificates: [],
        publications: [],
        metaData: [],
      },
      status: "draft",
      privacy: "private",
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
      createdAt: "2026-04-20T05:17:01.272Z",
      updatedAt: "2026-04-20T05:17:01.272Z",
    };
    const result = ResumeSchema.safeParse(realBackendResponse);
    if (!result.success) {
      // Produce a helpful error so CI log tells you exactly what drifted.
      const msgs = result.error.issues
        .map((i) => `  [${i.path.join(".")}] ${i.code}: ${i.message}`)
        .join("\n");
      throw new Error(
        `Canonical ResumeSchema rejected a real backend response:\n${msgs}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("createResume uses the canonical schema (response parses, no validation error)", async () => {
    const clean = makeCleanResume();
    // Simulate what apiClient.request() returns: the unwrapped data.
    mockedApi.request.mockResolvedValue({ data: clean });

    const result = await resumeService.createResume({
      name: "test upload",
      parsedContent: clean.content,
      privacy: "private",
    });

    // If the service had re-introduced the legacy schema, validation
    // would have thrown before we got here.
    expect(result.id).toBe(clean.id);
    expect(result.title).toBe("Senior Engineer Resume");
  });

  // ─── validateApiResponse regression ────────────────────────────────────
  // 2026-04-20: validateApiResponse used to call nullToUndefined(data) which
  // converted the backend's legal nulls (for .nullable() fields like slug,
  // parentId, templateId, metaResumeId, diffPercent, sentimentScore) into
  // undefineds — which the canonical schema rejects. That produced the
  // exact "expected string/number, received undefined" × 6 upload error.
  // This test pins the backend's null shape through the real validator.
  it("validateApiResponse accepts backend nulls for .nullable() fields (no nullToUndefined preprocessing)", async () => {
    const { validateApiResponse } = await import("@shared/api");
    const { ResumeSchema } = await import("@shared/resume");

    const backendResponseWithNulls = makeCleanResume({
      slug: null,
      parentId: null,
      templateId: null,
      metaResumeId: null,
      diffPercent: null,
      sentimentScore: null,
    });

    const result = validateApiResponse(backendResponseWithNulls, ResumeSchema);
    if (result.success === false) {
      throw new Error(
        `Regression: nullToUndefined is back. Backend nulls rejected by canonical schema: ${result.error}`,
      );
    }
    expect(result.success).toBe(true);
    expect(result.data.slug).toBe(null);
    expect(result.data.parentId).toBe(null);
    expect(result.data.diffPercent).toBe(null);
  });
});
