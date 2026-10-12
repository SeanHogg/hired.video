/**
 * ONE rule for every way into the workspace: /studio/new (+ its format
 * params), /studio/resume/:id and /studio/:id.
 */
import { describe, expect, it } from "vitest";
import { kitResumePath, resolveWorkspaceRoute } from "../workspace-route";

const route = (extra: { projectId?: string; resumeId?: string; query?: string; state?: unknown } = {}) =>
  resolveWorkspaceRoute({
    projectId: extra.projectId,
    resumeId: extra.resumeId,
    params: new URLSearchParams(extra.query ?? ""),
    state: extra.state ?? null,
  });

describe("resolveWorkspaceRoute", () => {
  it("bare /studio/new is a new kit; a template / subject / capture / new=1 starts a studio format", () => {
    expect(route({ projectId: "new" })).toEqual({ kind: "kit", projectId: null, resumeId: null });
    for (const query of ["contentTemplate=podcast_trailer", "template=basic", "studioTemplate=x", "subject=job:1", "capture=screen", "new=1", "claim=1"]) {
      expect(route({ projectId: "new", query })).toEqual({ kind: "studio" });
    }
  });

  it("a template whose output IS the kit opens a new kit, slug or id", () => {
    expect(route({ projectId: "new", query: "contentTemplate=resume" }).kind).toBe("kit");
    expect(route({ projectId: "new", query: "contentTemplate=resume-doc" }).kind).toBe("kit");
  });

  it("/studio/resume/:id is that résumé's kit", () => {
    expect(route({ resumeId: "r1" })).toEqual({ kind: "kit", projectId: null, resumeId: "r1" });
  });

  it("/studio/:id loads the project, unless a kit handed itself over", () => {
    expect(route({ projectId: "p1" })).toEqual({ kind: "load", projectId: "p1" });
    expect(route({ projectId: "p1", state: { kit: { projectId: "p1", resumeId: "r1" } } })).toEqual({
      kind: "kit",
      projectId: "p1",
      resumeId: "r1",
    });
    // State for another project is ignored.
    expect(route({ projectId: "p1", state: { kit: { projectId: "p2", resumeId: "r1" } } }).kind).toBe("load");
  });
});

describe("kitResumePath", () => {
  it("encodes the id and keeps params", () => {
    expect(kitResumePath("a b")).toBe("/studio/resume/a%20b");
    expect(kitResumePath("r1", new URLSearchParams({ panel: "design" }))).toBe("/studio/resume/r1?panel=design");
  });
});
