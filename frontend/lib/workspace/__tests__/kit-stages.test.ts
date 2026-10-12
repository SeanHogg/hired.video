/** A kit's stages as data: the page each opens, Next, Skip, Post. */
import { describe, expect, it } from "vitest";
import { BUILD_STAGES } from "@/lib/build/build-stages";
import {
  KIT_STAGE_COUNT,
  kitNextAction,
  nextLabelKey,
  pageForStage,
  stageIsOptional,
  stageNumber,
  stageOpensPost,
  stageTitleKey,
} from "../kit-stages";

describe("kit stages", () => {
  it("open the résumé, then the letter (résumé until one exists), then the video", () => {
    expect(BUILD_STAGES.map((s) => pageForStage(s, { hasLetter: true }))).toEqual(["resume", "resume", "letter", "video", "video"]);
    expect(pageForStage("target", { hasLetter: false })).toBe("resume");
  });

  it("Next walks the stages and, at the last, posts", () => {
    expect(kitNextAction("create")).toEqual({ kind: "stage", stage: "strengthen" });
    expect(kitNextAction("video")).toEqual({ kind: "stage", stage: "promote" });
    expect(kitNextAction("promote")).toEqual({ kind: "post" });
  });

  it("only the last stage opens Post; only Target can be skipped", () => {
    expect(BUILD_STAGES.filter(stageOpensPost)).toEqual(["promote"]);
    expect(BUILD_STAGES.filter(stageIsOptional)).toEqual(["target"]);
  });

  it("numbers stages 1–5 and names their lines and Next labels by key", () => {
    expect(KIT_STAGE_COUNT).toBe(5);
    expect(BUILD_STAGES.map(stageNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(stageTitleKey("target")).toBe("workspace.stage.target.title");
    expect(nextLabelKey("promote")).toBe("workspace.stage.promote.next");
  });
});
