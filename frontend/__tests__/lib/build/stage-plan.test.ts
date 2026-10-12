import { describe, expect, it } from "vitest";
import { BUILD_STAGES } from "@/lib/build/build-stages";
import { STAGE_PLANS, nextStage } from "@/lib/build/stage-plan";
import { stageToolMode, toolsForStage } from "@/lib/build/stage-tools";
import { toolPage } from "@/components/tools/tool-pages";
import { getTool } from "@/lib/tools/registry";

describe("STAGE_PLANS", () => {
  it("gives every stage a plan with at least one step", () => {
    for (const stage of BUILD_STAGES) expect(STAGE_PLANS[stage].steps.length).toBeGreaterThan(0);
  });

  it("only runs tools the draft is enough for, and opens the rest in the slide-out", () => {
    for (const stage of BUILD_STAGES) {
      for (const step of STAGE_PLANS[stage].steps) {
        if (step.kind === "tool") {
          expect(getTool(step.toolId), step.toolId).toBeDefined();
          expect(stageToolMode(step.toolId), step.toolId).toBe("run");
        }
        if (step.kind === "panel") expect(toolPage(step.toolId), step.toolId).not.toBeNull();
      }
    }
  });
});

describe("stageToolMode", () => {
  it("runs no-input tools in the chat and opens job-input tools in the slide-out", () => {
    expect(stageToolMode("ai-resume-scorer")).toBe("run");
    expect(stageToolMode("resume-roast")).toBe("run");
    expect(stageToolMode("job-resume-match")).toBe("panel");
    expect(stageToolMode("resume-consolidator")).toBe("panel");
  });

  it("opens a tool whose page is the result in the slide-out, though it needs no input", () => {
    expect(stageToolMode("career-360")).toBe("panel");
  });

  it("has a way to open every staged tool on the page", () => {
    for (const stage of BUILD_STAGES) {
      for (const entry of toolsForStage(stage)) {
        if (stageToolMode(entry.id) === "panel") expect(toolPage(entry.id), entry.id).not.toBeNull();
      }
    }
  });
});

describe("nextStage", () => {
  it("walks the journey and stops at Promote", () => {
    expect(nextStage("create", BUILD_STAGES)).toBe("strengthen");
    expect(nextStage("video", BUILD_STAGES)).toBe("promote");
    expect(nextStage("promote", BUILD_STAGES)).toBeNull();
  });
});
