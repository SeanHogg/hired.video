/** "Your kits" rows: résumés matched with their kit video, in memory. */
import { describe, expect, it } from "vitest";
import { buildKitRows, isProjectPosted, kitHref } from "../kits";

const RESUMES = [
  { id: "r1", title: "Sean Hogg · CIO", isMaster: true, hasCoverLetter: false, updatedAt: "2026-10-08T10:00:00Z" },
  { id: "r2", title: "Sean Hogg · CIO at Macomb", isMaster: false, hasCoverLetter: true, updatedAt: "2026-10-06T10:00:00Z" },
  { id: null, title: "malformed" },
  { id: "r3", title: "  ", updatedAt: "2026-10-01T10:00:00Z" },
];
const kit = (id: string, resumeId: string, updated: string, status = "Draft", publicationCount?: number) => ({
  id,
  status,
  publicationCount,
  updateDateTime: updated,
  subjects: [
    { kind: "resume", id: resumeId },
    { kind: "resume_video", id: resumeId },
  ],
});
const PROJECTS = [
  kit("p1-old", "r1", "2026-09-01T00:00:00Z"),
  kit("p1", "r1", "2026-10-07T00:00:00Z", "Published", 3),
  kit("p2", "r2", "2026-10-09T00:00:00Z"),
  // A video ABOUT a résumé (no resume_video link) is not its kit's video.
  { id: "other", status: "Draft", updateDateTime: "2026-10-09T00:00:00Z", subjects: [{ kind: "resume", id: "r3" }] },
];

describe("buildKitRows", () => {
  const rows = buildKitRows(RESUMES, PROJECTS, "Untitled");

  it("makes one row per résumé, newest first, with its newest kit video", () => {
    expect(rows.map((r) => r.resumeId)).toEqual(["r2", "r1", "r3"]);
    expect(rows.find((r) => r.resumeId === "r1")?.video).toEqual({ projectId: "p1", posted: true, channels: 3 });
    expect(rows.find((r) => r.resumeId === "r3")?.video).toBeNull();
  });

  it("defaults the posted-channel count to 0 when the list omits it", () => {
    expect(rows.find((r) => r.resumeId === "r2")?.video).toEqual({ projectId: "p2", posted: false, channels: 0 });
  });

  it("counts a video live on a channel as posted even before its status flips", () => {
    const onYouTube = kit("p2", "r2", "2026-10-09T00:00:00Z", "Draft", 1);
    const [row] = buildKitRows([RESUMES[1]], [onYouTube], "Untitled");
    expect(row.video).toEqual({ projectId: "p2", posted: true, channels: 1 });
  });

  it("carries the letter flag and names blank titles", () => {
    expect(rows.find((r) => r.resumeId === "r2")?.hasLetter).toBe(true);
    expect(rows.find((r) => r.resumeId === "r3")?.title).toBe("Untitled");
  });

  it("opens the kit project, or the résumé resolver when there is no video yet", () => {
    expect(kitHref(rows[0])).toBe("/studio/p2");
    expect(kitHref(rows[2])).toBe("/studio/resume/r3");
  });

  it("shows each résumé's newest video only — an older copy or an orphan stays a project row", () => {
    const orphan = kit("p9", "gone", "2026-10-09T00:00:00Z");
    const shown = buildKitRows(RESUMES, [...PROJECTS, orphan], "Untitled").flatMap((r) => (r.video ? [r.video.projectId] : []));
    expect(shown.sort()).toEqual(["p1", "p2"]);
  });
});

describe("isProjectPosted", () => {
  it("is posted when Published or live on a channel, else a draft", () => {
    expect(isProjectPosted({ status: "Published", publicationCount: 0 })).toBe(true);
    expect(isProjectPosted({ status: "Draft", publicationCount: 2 })).toBe(true);
    expect(isProjectPosted({ status: "Draft" })).toBe(false);
    expect(isProjectPosted({ status: null, publicationCount: null })).toBe(false);
  });
});
