import { describe, expect, it } from "vitest";
import { canPostKind, shareChannelsFor } from "@/lib/studio/share-channels";

describe("shareChannelsFor", () => {
  it("offers LinkedIn, YouTube, the social networks and Profile for video, in display order", () => {
    expect(shareChannelsFor("video")).toEqual(["linkedin", "youtube", "tiktok", "instagram", "x", "facebook", "profile"]);
  });

  it("offers podcasts LinkedIn, YouTube and Profile (no social video networks)", () => {
    expect(shareChannelsFor("podcast")).toEqual(["linkedin", "youtube", "profile"]);
  });

  it("offers only the on-platform profile for profile-only kinds", () => {
    expect(shareChannelsFor("voice")).toEqual(["profile"]);
    expect(shareChannelsFor("animation")).toEqual(["profile"]);
    expect(shareChannelsFor("comic")).toEqual(["profile"]);
  });

  it("offers nothing for kinds without a direct-post destination", () => {
    expect(shareChannelsFor("document")).toEqual([]);
    expect(shareChannelsFor("game")).toEqual([]);
    expect(shareChannelsFor("image")).toEqual([]);
    expect(canPostKind("document")).toBe(false);
    expect(canPostKind("video")).toBe(true);
  });
});
