/** "Your work": kits + other projects in one list, newest first, filtered. */
import { describe, expect, it } from "vitest";
import type { StudioProject } from "@/lib/services/studio-service";
import type { KitRow } from "@/lib/workspace/kits";
import { buildWorkItems, filterWorkItems, workProjects } from "../work-items";

const KITS: KitRow[] = [
  { resumeId: "r1", title: "Sean Hogg · CIO", isMaster: true, hasLetter: false, video: { projectId: "p1", posted: true, channels: 3 }, updatedAt: "2026-10-08T10:00:00Z" },
  { resumeId: "r2", title: "Sean Hogg · PM", isMaster: false, hasLetter: true, video: null, updatedAt: "2026-10-02T10:00:00Z" },
];
const project = (id: string, title: string, updated: string, status = "Draft", publicationCount = 0) =>
  ({ id, title, status, publicationCount, updateDateTime: updated, isPublic: false }) as unknown as StudioProject;
const PROJECTS = [
  project("podcast", "Climate pitch", "2026-10-09T00:00:00Z"),
  project("reel", "Intro reel", "2026-10-05T00:00:00Z", "Published"),
];

describe("buildWorkItems", () => {
  const items = buildWorkItems(KITS, PROJECTS, "");

  it("merges kits and projects, newest edit first", () => {
    expect(items.map((i) => i.id)).toEqual(["podcast", "kit:r1", "reel", "kit:r2"]);
  });

  it("marks a kit posted by its video and a project by the shared posted rule", () => {
    expect(items.filter((i) => i.posted).map((i) => i.id)).toEqual(["kit:r1", "reel"]);
  });

  it("narrows kits by the search text (projects arrive pre-searched)", () => {
    expect(buildWorkItems(KITS, [], "pm").map((i) => i.id)).toEqual(["kit:r2"]);
  });

  it("treats no kits yet (null while loading) as none", () => {
    expect(buildWorkItems(null, PROJECTS, "").map((i) => i.id)).toEqual(["podcast", "reel"]);
  });
});

describe("filterWorkItems", () => {
  const items = buildWorkItems(KITS, PROJECTS, "");

  it("filters kits / other / posted / drafts", () => {
    expect(filterWorkItems(items, "all")).toHaveLength(4);
    expect(filterWorkItems(items, "kits").map((i) => i.id)).toEqual(["kit:r1", "kit:r2"]);
    expect(filterWorkItems(items, "other").map((i) => i.id)).toEqual(["podcast", "reel"]);
    expect(filterWorkItems(items, "posted").map((i) => i.id)).toEqual(["kit:r1", "reel"]);
    expect(filterWorkItems(items, "drafts").map((i) => i.id)).toEqual(["podcast", "kit:r2"]);
  });

  it("returns only the projects for the bulk bar", () => {
    expect(workProjects(items).map((p) => p.id)).toEqual(["podcast", "reel"]);
  });
});
