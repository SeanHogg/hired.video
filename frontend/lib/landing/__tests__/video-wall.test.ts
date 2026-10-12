import { describe, expect, it } from "vitest";
import type { PublicVideo } from "@/lib/services/studio-service";
import {
  WALL_CTA_INDEX,
  WALL_VIDEO_COUNT,
  filterVideos,
  inlinePreviewUrl,
  wallFilters,
  shortName,
  videoOwnerPath,
  wallItems,
} from "../video-wall";

/** Mirrors a real /api/studio/videos/public row (R2-hosted render). */
function video(over: Partial<PublicVideo> = {}): PublicVideo {
  return {
    id: "8c1f6a0e-2b7d-4f3e-9a51-0d2c4b6e8f10",
    title: "Sean Hogg — video resume",
    videoUrl: "https://cdn.hired.video/videos/8c1f6a0e/final.mp4",
    youtubeUrl: null,
    youtubeVideoId: null,
    thumbnailUrl: "https://cdn.hired.video/videos/8c1f6a0e/thumb.jpg",
    description: null,
    isFeatured: false,
    ownerId: "3f0b9d2c-7a1e-4c55-8e2f-6b9a0c1d2e3f",
    ownerName: "Sean Hogg",
    ownerHeadline: "Chief Information Officer",
    resumeId: null,
    mediaKind: "video",
    timelineSpec: null,
    gameState: null,
    imageState: null,
    animationState: null,
    cadState: null,
    comicState: null,
    createdAt: "2026-10-08T21:12:00.000Z",
    ...over,
  };
}

describe("shortName", () => {
  it("keeps the first name and the last initial", () => {
    expect(shortName("Sean Hogg")).toBe("Sean H.");
    expect(shortName("Maria del Carmen López")).toBe("Maria L.");
  });
  it("keeps a single name as is", () => expect(shortName("Prince")).toBe("Prince"));
  it("handles empty and whitespace names", () => {
    expect(shortName("")).toBe("");
    expect(shortName("   ")).toBe("");
    expect(shortName(null)).toBe("");
  });
  it("upper-cases the initial", () => expect(shortName("dana kim")).toBe("dana K."));
});

describe("wallItems", () => {
  it("shows only the invite card before anyone has posted", () => {
    expect(wallItems([])).toEqual([{ kind: "cta" }]);
  });
  it("puts the invite card last when there are fewer videos than its slot", () => {
    const items = wallItems([video({ id: "a" })]);
    expect(items.map((i) => i.kind)).toEqual(["video", "cta"]);
  });
  it("puts the invite card in its slot and caps the videos", () => {
    const many = Array.from({ length: 20 }, (_, i) => video({ id: `v${i}` }));
    const items = wallItems(many);
    expect(items).toHaveLength(WALL_VIDEO_COUNT + 1);
    expect(items[WALL_CTA_INDEX]).toEqual({ kind: "cta" });
    expect(items.filter((i) => i.kind === "video")).toHaveLength(WALL_VIDEO_COUNT);
  });
});

describe("inlinePreviewUrl", () => {
  it("plays a hosted file", () => expect(inlinePreviewUrl(video())).toBe(video().videoUrl));
  it("keeps the still for a YouTube video", () => {
    const yt = video({ youtubeUrl: "https://youtu.be/abc", videoUrl: "https://youtu.be/abc" });
    expect(inlinePreviewUrl(yt)).toBeNull();
  });
  it("is null with no source", () => expect(inlinePreviewUrl(video({ videoUrl: null }))).toBeNull());
});

describe("videoOwnerPath", () => {
  it("links the person's profile", () => {
    expect(videoOwnerPath(video())).toBe("/people/3f0b9d2c-7a1e-4c55-8e2f-6b9a0c1d2e3f");
  });
  it("is null for an older feed row with no owner id", () => {
    expect(videoOwnerPath(video({ ownerId: undefined }))).toBeNull();
  });
});

describe("wallFilters / filterVideos", () => {
  const season = new Set(["halloween", "fall"]);
  const vids = [
    video({ id: "a", goal: "contract", themeId: "halloween" }),
    video({ id: "b", goal: "fullTime", themeId: "standard" }),
    video({ id: "c", goal: null, themeId: null }),
  ];
  it("offers only filters some video matches, in a stable order", () => {
    expect(wallFilters(vids, season)).toEqual(["all", "fullTime", "contract", "season"]);
    expect(wallFilters([video({ goal: null, themeId: null })], season)).toEqual([]);
  });
  it("filters by goal and by in-season theme", () => {
    expect(filterVideos(vids, "contract", season).map((v) => v.id)).toEqual(["a"]);
    expect(filterVideos(vids, "season", season).map((v) => v.id)).toEqual(["a"]);
    expect(filterVideos(vids, "all", season)).toHaveLength(3);
  });
});
