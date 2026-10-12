import { describe, expect, it } from "vitest";
import { reviewHandoffLink } from "@/lib/build/review/review-handoff-link";

describe("reviewHandoffLink", () => {
  it("merges a saved résumé via ?merge=, carrying its name", () => {
    expect(
      reviewHandoffLink("t-1", { kind: "merge", source: { kind: "resume", resumeId: "s-2", title: "Old CV" } }),
    ).toEqual({ path: "/studio/resume/t-1?merge=s-2", state: { mergeLabel: "Old CV" } });
  });

  it("merges a file through router state (a File can't go in a URL)", () => {
    const file = new File(["x"], "cv.pdf");
    expect(reviewHandoffLink("t-1", { kind: "merge", source: { kind: "file", file } })).toEqual({
      path: "/studio/resume/t-1",
      state: { mergeFile: file },
    });
  });

  it("tailors to a tracked job via ?job=, and creates a version with intent=create", () => {
    expect(reviewHandoffLink("t-1", { kind: "job", create: false, job: { jobId: "j-3", label: "VP Eng · Acme" } })).toEqual({
      path: "/studio/resume/t-1?job=j-3",
      state: { jobLabel: "VP Eng · Acme" },
    });
    expect(reviewHandoffLink("t-1", { kind: "job", create: true, job: { jobId: "j-3", label: "" } }).path).toBe(
      "/studio/resume/t-1?job=j-3&intent=create",
    );
  });

  it("carries a pasted job post in router state", () => {
    expect(reviewHandoffLink("t-1", { kind: "job", create: true, job: { jobHtml: "JD text", label: "jd.txt" } })).toEqual({
      path: "/studio/resume/t-1",
      state: { jobText: "JD text", jobLabel: "jd.txt", createForJob: true },
    });
  });
});
