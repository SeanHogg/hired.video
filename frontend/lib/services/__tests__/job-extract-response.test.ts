import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../api-client";
import { jobService, parseExtractJobResponse, ExtractJobResponseSchema } from "../job-service";
import { jobTextFromSummary } from "@/lib/build/kit-drop";

vi.mock("../../api-client", () => ({
  apiClient: { post: vi.fn(), get: vi.fn() },
}));

const post = vi.mocked(apiClient.post);
const get = vi.mocked(apiClient.get);

// Shaped like the real POST /api/Job/Extract answers (api/src/routes/jobs.ts).
const CREATED = {
  id: "job-1",
  title: "Chief Information Officer",
  company: "Macomb Community College",
  description: "Lead IT strategy across three campuses.",
  applyUrl: "https://jobs.example.com/cio",
};
const DUPLICATES = {
  duplicate_candidates: [
    { id: "job-7", title: "CIO", company: "Macomb CC", location: "Warren, MI", sourceUrl: "https://a", createdAt: "2026-09-01" },
    { id: "job-8", title: "CIO (old)", company: null, location: null, sourceUrl: null, createdAt: "2025-01-01" },
  ],
  parsed_title: "Chief Information Officer",
  parsed_company: "Macomb Community College",
};

describe("parseExtractJobResponse", () => {
  it("passes a created / matched job through", () => {
    const result = parseExtractJobResponse(ExtractJobResponseSchema.parse(CREATED));
    expect(result.kind).toBe("job");
    expect(result.job.id).toBe("job-1");
  });

  it("resolves the duplicate-candidates shape to the best (first) existing job", () => {
    const result = parseExtractJobResponse(ExtractJobResponseSchema.parse(DUPLICATES));
    expect(result).toEqual({
      kind: "duplicate",
      job: { id: "job-7", title: "CIO", company: "Macomb CC", location: "Warren, MI" },
    });
  });

  it("falls back to the parsed company when the candidate has none", () => {
    const only = { ...DUPLICATES, duplicate_candidates: [DUPLICATES.duplicate_candidates[1]] };
    const result = parseExtractJobResponse(ExtractJobResponseSchema.parse(only));
    expect(result.job.company).toBe("Macomb Community College");
    expect(result.job.location).toBeUndefined();
  });

  it("rejects an empty candidate list or a row without an id", () => {
    expect(ExtractJobResponseSchema.safeParse({ duplicate_candidates: [] }).success).toBe(false);
    expect(ExtractJobResponseSchema.safeParse({ title: "No id" }).success).toBe(false);
  });
});

describe("jobService.extractJobFromUrl", () => {
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
  });

  it("returns the job the importer made", async () => {
    post.mockResolvedValue({ success: true, data: ExtractJobResponseSchema.parse(CREATED) });
    await expect(jobService.extractJobFromUrl("https://jobs.example.com/cio")).resolves.toMatchObject({ id: "job-1" });
    expect(get).not.toHaveBeenCalled();
  });

  it("uses the best duplicate with its full posting, ready for the kit's job slot", async () => {
    post.mockResolvedValue({ success: true, data: ExtractJobResponseSchema.parse(DUPLICATES) });
    get.mockResolvedValue({
      success: true,
      data: { id: "job-7", title: "CIO", company: "Macomb CC", description: "Own the technology roadmap.", salaryMin: null },
    });
    const job = await jobService.extractJobFromUrl("https://jobs.example.com/cio");
    expect(get).toHaveBeenCalledWith("/api/Job/job-7");
    expect(job).toMatchObject({ id: "job-7", description: "Own the technology roadmap.", location: "Warren, MI" });
    expect(jobTextFromSummary(job).split("\n")[0]).toBe("CIO · Macomb CC");
  });

  it("still resolves to the candidate when its full posting can't be read", async () => {
    post.mockResolvedValue({ success: true, data: ExtractJobResponseSchema.parse(DUPLICATES) });
    get.mockRejectedValue(new Error("offline"));
    await expect(jobService.extractJobFromUrl("https://jobs.example.com/cio")).resolves.toEqual({
      id: "job-7",
      title: "CIO",
      company: "Macomb CC",
      location: "Warren, MI",
    });
  });
});
