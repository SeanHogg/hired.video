import { describe, expect, it } from "vitest";
import { BUILD_STAGES } from "@/lib/build/build-stages";
import { toolsForStage } from "@/lib/build/stage-tools";
import { TOOLS_CATALOG } from "@/data/tools-catalog";
import { toolPage } from "@/components/tools/tool-pages";

const ids = (stage: (typeof BUILD_STAGES)[number]) => toolsForStage(stage).map((t) => t.id);

describe("toolsForStage", () => {
  it("offers at least one tool at every stage of the journey", () => {
    for (const stage of BUILD_STAGES) expect(toolsForStage(stage).length).toBeGreaterThan(0);
  });

  it("places tools by their catalog buildStage", () => {
    expect(ids("strengthen")).toEqual(
      expect.arrayContaining(["ai-resume-scorer", "resume-roast", "skill-extractor", "summarize-resume"]),
    );
    expect(ids("target")).toEqual(expect.arrayContaining(["job-resume-match", "resume-tailor", "interview-questions"]));
    expect(ids("promote")).toEqual(expect.arrayContaining(["vendor-sync", "profile-audit"]));
  });

  it("keeps tools outside the résumé → video → post flow off every stage", () => {
    const staged = new Set(BUILD_STAGES.flatMap(ids));
    for (const id of ["comp-analyzer", "predictive-assessments", "inbox-sync", "interview-templates", "chrome-extension-recruiter"]) {
      expect(staged.has(id)).toBe(false);
    }
    // Every staged id is a real catalog entry, listed once.
    expect(staged.size).toBe(TOOLS_CATALOG.filter((e) => e.buildStage).length);
  });

  it("opens every staged tool on the page — none hands off to another page or chat", () => {
    for (const stage of BUILD_STAGES) {
      for (const id of ids(stage)) expect(toolPage(id), id).not.toBeNull();
    }
    // The extension's install page stays off the journey; the interview
    // coach runs on the page (Video stage).
    const staged = new Set(BUILD_STAGES.flatMap(ids));
    expect(staged.has("chrome-extension-jobseeker")).toBe(false);
    expect(ids("video")).toContain("interview-coach");
  });
});

describe("toolPage", () => {
  it("returns null for a tool with no page of its own", () => {
    expect(toolPage("chrome-extension-jobseeker")).toBeNull();
    expect(toolPage("toString")).toBeNull();
  });
});
