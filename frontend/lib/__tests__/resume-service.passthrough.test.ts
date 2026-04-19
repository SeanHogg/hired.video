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
