import { describe, expect, it } from "vitest";
import { canSetAsPitch } from "../SetAsPitchControl";

const OWNER = "5b0c7a9e-1f43-4c4e-9a51-2d7f3c1e8a10";
const OTHER = "9e2d4f61-7a8b-4c3d-8e9f-0a1b2c3d4e5f";

const pitchProject = { userId: OWNER, mediaKind: "video" as const, purpose: "pitch" as const };

describe("canSetAsPitch — SetAsPitchControl's self-gate", () => {
  it("shows for the owner's video pitch project", () => {
    expect(canSetAsPitch(pitchProject, OWNER)).toBe(true);
  });

  it("treats a missing mediaKind as video (pre-#894 rows)", () => {
    expect(canSetAsPitch({ ...pitchProject, mediaKind: undefined }, OWNER)).toBe(true);
  });

  it("hides for anonymous viewers and non-owners", () => {
    expect(canSetAsPitch(pitchProject, null)).toBe(false);
    expect(canSetAsPitch(pitchProject, undefined)).toBe(false);
    expect(canSetAsPitch(pitchProject, OTHER)).toBe(false);
  });

  it("hides for non-video kinds and non-pitch purposes", () => {
    expect(canSetAsPitch({ ...pitchProject, mediaKind: "document" }, OWNER)).toBe(false);
    expect(canSetAsPitch({ ...pitchProject, purpose: "resume" }, OWNER)).toBe(false);
    expect(canSetAsPitch({ ...pitchProject, purpose: null }, OWNER)).toBe(false);
  });

  it("hides while no project is loaded", () => {
    expect(canSetAsPitch(null, OWNER)).toBe(false);
  });
});
