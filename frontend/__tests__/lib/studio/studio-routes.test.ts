import { describe, expect, it } from "vitest";
import { isStudioEditorPath } from "@/lib/studio/studio-routes";

describe("isStudioEditorPath", () => {
  it("matches editor routes including new drafts and seed-style ids", () => {
    expect(isStudioEditorPath("/studio/new")).toBe(true);
    expect(isStudioEditorPath("/studio/3f2a9c1e-0b7d-4c55-9a1e-6a2f0c8d9e11")).toBe(true);
    expect(isStudioEditorPath("/studio/seed-video-001/")).toBe(true);
    expect(isStudioEditorPath("/Studio/NEW")).toBe(true);
  });

  it("matches the kit resolver", () => {
    expect(isStudioEditorPath("/studio/resume/r1")).toBe(true);
  });

  it("does not match the studio landing or unrelated routes", () => {
    expect(isStudioEditorPath("/studio")).toBe(false);
    expect(isStudioEditorPath("/studio/")).toBe(false);
    expect(isStudioEditorPath("/studios/abc")).toBe(false);
    expect(isStudioEditorPath("/builder")).toBe(false);
    expect(isStudioEditorPath("/")).toBe(false);
  });
});
