/**
 * The video plan stored on a résumé (`content.meta.video`): reading tolerates
 * a missing / invalid plan, patches clear choices with `undefined`, an empty
 * plan leaves no key behind, other metadata is kept, and the last scene can't
 * be switched off.
 */
import { describe, it, expect } from "vitest";
import {
  isLastSceneOn,
  patchScenePlan,
  readVideoPlan,
  VideoPlanSchema,
  withVideoPlan,
  type VideoPlan,
} from "@shared/video-plan";

const RESUME = { basics: { name: "Sean Hogg" }, meta: { template: "hired-default" } };

describe("video plan", () => {
  it("reads the default (empty) plan when none is stored or it is invalid", () => {
    expect(readVideoPlan(RESUME)).toEqual({});
    expect(readVideoPlan({ meta: { video: { scenes: { proof: { duration: 99 } } } } })).toEqual({});
    expect(readVideoPlan(null)).toEqual({});
  });

  it("stores a plan beside the other metadata, and removes the key when empty", () => {
    const withPlan = withVideoPlan(RESUME, { music: "none" });
    expect(withPlan.meta).toEqual({ template: "hired-default", video: { music: "none" } });
    expect(readVideoPlan(withPlan)).toEqual({ music: "none" });
    expect(withVideoPlan(withPlan, {}).meta).toEqual({ template: "hired-default" });
  });

  it("patches one scene; undefined clears a choice and an empty scene disappears", () => {
    let plan: VideoPlan = patchScenePlan({}, "proof", { duration: 5, look: "midnight" });
    expect(plan).toEqual({ scenes: { proof: { duration: 5, look: "midnight" } } });
    plan = patchScenePlan(plan, "proof", { duration: undefined });
    expect(plan).toEqual({ scenes: { proof: { look: "midnight" } } });
    plan = patchScenePlan(plan, "proof", { look: undefined });
    expect(plan).toEqual({});
    expect(VideoPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("knows when a scene is the last one still on", () => {
    let plan: VideoPlan = {};
    for (const id of ["hook", "who", "proof", "skills"] as const) plan = patchScenePlan(plan, id, { off: true });
    expect(isLastSceneOn(plan, "next")).toBe(true);
    expect(isLastSceneOn({}, "next")).toBe(false);
  });

  it("stores frame-level hand edits and scene voiceover under the plan", () => {
    const plan: VideoPlan = {
      scenes: { hook: { voiceover: "Hi, I'm Sean." } },
      canvas: {
        widgets: { "build-proof-heading": { position: { x: 0.1, y: 0.1, width: 0.5, height: 0.2, z: 3, rotation: 0 }, hidden: true } },
        added: { proof: [{ id: "owner-note", kind: "text", position: {}, params: {} }] },
      },
    };
    expect(readVideoPlan(withVideoPlan(RESUME, plan))).toEqual(plan);
    expect(VideoPlanSchema.safeParse({ canvas: { widgets: { a: { hidden: false } } } }).success).toBe(false);
  });

  it("rejects unknown scenes and fields (the chat model's output is checked against this)", () => {
    expect(VideoPlanSchema.safeParse({ scenes: { resume: { off: true } } }).success).toBe(false);
    expect(VideoPlanSchema.safeParse({ scenes: { hook: { colour: "red" } } }).success).toBe(false);
  });
});
