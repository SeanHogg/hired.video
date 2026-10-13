import { describe, expect, it } from "vitest";
import { describeFailure, describeWaiting } from "@/lib/diagnostics/diagnostics-report";
import { digestResume } from "@/lib/diagnostics/resume-digest";

describe("describeFailure", () => {
  it("reads the server envelope into one line (real 2026-10-08 revise failure)", () => {
    const line = describeFailure({
      id: 1,
      method: "POST",
      url: "https://api.hired.video/api/resumes/revise",
      status: 422,
      responseBody: {
        success: false,
        error: { code: "REVISE_FAILED", message: "The AI reply wasn't a resume. Try rephrasing the change." },
      },
      timestamp: "2026-10-08T00:04:45.800Z",
      durationMs: 21_340,
    });
    expect(line).toBe(
      "00:04:45 POST /api/resumes/revise → 422 REVISE_FAILED: The AI reply wasn't a resume. Try rephrasing the change. (21.3s)",
    );
  });

  it("falls back to the transport error when nothing came back", () => {
    const line = describeFailure({
      id: 2,
      method: "GET",
      url: "https://api.hired.video/api/resumes/abc?x=1",
      error: "Failed to fetch",
      timestamp: "2026-10-08T00:03:56.390Z",
    });
    expect(line).toBe("00:03:56 GET /api/resumes/abc?x=1 → network Failed to fetch");
  });
});

describe("describeWaiting", () => {
  it("names a publish still waiting, in minutes (real 2026-10-13 stuck YouTube post)", () => {
    const line = describeWaiting({
      id: 7,
      method: "POST",
      url: "https://api.hired.video/api/studio/projects/9ff4634c-a0af-41ba-90b5-1a152aa0c477/publish/social/youtube",
      timestamp: "2026-10-13T03:44:47.100Z",
      waitingMs: 251_400,
    });
    expect(line).toBe(
      "03:44:47 POST /api/studio/projects/9ff4634c-a0af-41ba-90b5-1a152aa0c477/publish/social/youtube → still waiting (4m11s)",
    );
  });

  it("uses seconds under a minute (boundary)", () => {
    const line = describeWaiting({ id: 8, method: "PATCH", url: "/api/studio/projects/p/status", timestamp: "2026-10-13T03:44:47.100Z", waitingMs: 20_000 });
    expect(line).toBe("03:44:47 PATCH /api/studio/projects/p/status → still waiting (20s)");
  });
});

describe("digestResume", () => {
  it("keeps the shape, drops the prose and the bookkeeping", () => {
    const digest = digestResume({
      basics: { name: "Sean Hogg", label: "CIO", email: "a@b.c", summary: "x".repeat(500) },
      work: [{ name: "BuilderForce.ai", position: "Chief Innovation Officer", startDate: "2026-01", endDate: "Present", highlights: [] }],
      education: [{ institution: "University of Windsor", studyType: "BSc", area: "Computer Science", startDate: "01/1999" }],
      skills: [{ name: "a" }, { name: "b" }],
      meta: { template: "executive-taupe", coverLetter: { jobTitle: "CIO", organization: "Macomb", date: "2026-10-06", highlights: [1, 2] }, video: { scenes: { hook: {} } } },
      skillEvidence: new Array(120).fill({}),
    });
    expect(digest?.basics).toEqual({ name: "Sean Hogg", label: "CIO", contact: ["email"], summaryChars: 500 });
    expect(digest?.sections.work).toEqual(["Chief Innovation Officer @ BuilderForce.ai · 2026-01 → Present · 0 bullets"]);
    expect(digest?.sections.education).toEqual(["BSc Computer Science @ University of Windsor · 01/1999"]);
    expect(digest?.sections.skills).toBe(2);
    expect(digest?.meta).toEqual({
      template: "executive-taupe",
      coverLetter: { jobTitle: "CIO", organization: "Macomb", date: "2026-10-06", highlights: 2 },
      video: { scenes: ["hook"], canvasOverrides: false },
    });
    expect(digest?.bookkeeping).toEqual({ skillEvidence: 120, metaData: 0 });
    expect(JSON.stringify(digest)).not.toContain("xxxxx");
  });
});
