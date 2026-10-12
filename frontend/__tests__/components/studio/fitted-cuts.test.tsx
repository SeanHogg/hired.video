/**
 * useFittedCuts (#2045): networks needing the same cut share one render; a
 * cut that fails falls back to the master (and its warning) until the
 * master's frame or length changes.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { variantSpecFor, type VariantSpec } from "@shared/publish-presets";
import { isVideoPublishPlatform } from "@shared/social-platforms";
import type { PublishHandlers } from "@/lib/studio/use-publish-handlers";
import type { StudioProject } from "@/lib/services/studio-service";
import type { ShareChannelId } from "@/lib/studio/share-channels";
import { useFittedCuts } from "@/components/studio/v2/focus/useFittedCuts";

const PROJECT = { id: "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d" } as StudioProject;

/** A 4:3 webcam take, 75 s: TikTok and Instagram both need "9x16-full". */
const webcam = (channel: ShareChannelId): VariantSpec | null =>
  isVideoPublishPlatform(channel) ? variantSpecFor(channel, { aspect: null, durationSec: 75 }) : null;

function publisher(ensureVariant: NonNullable<PublishHandlers["core"]["ensureVariant"]>) {
  return { core: { ensureVariant, ensureRendered: vi.fn(async () => PROJECT) } } as unknown as PublishHandlers;
}

describe("useFittedCuts", () => {
  it("renders one shared cut for every network that needs it", async () => {
    const ensureVariant = vi.fn(async (_p: StudioProject, spec: VariantSpec) => ({
      variantId: "v1",
      variantKey: spec.key,
      contentRevision: "v2-1k9x3f-4c.b",
      videoId: "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f",
      videoUrl: null,
    }));
    const { result } = renderHook(() => useFittedCuts(publisher(ensureVariant), webcam, "640x480@75"));
    let cuts = {};
    await act(async () => {
      cuts = await result.current.bakeCuts(PROJECT, ["tiktok", "instagram", "profile"]);
    });
    expect(ensureVariant).toHaveBeenCalledTimes(1);
    expect(cuts).toEqual({
      tiktok: "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f",
      instagram: "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f",
    });
  });

  it("falls back after a failed cut, and tries again once the master's shape changes", async () => {
    const ensureVariant = vi.fn(async () => {
      throw new Error("encoder unavailable");
    });
    const pub = publisher(ensureVariant);
    const { result, rerender } = renderHook(({ shape }) => useFittedCuts(pub, webcam, shape), {
      initialProps: { shape: "640x480@75" },
    });
    expect(result.current.bakes("tiktok")).toBe(true);
    await act(async () => {
      expect(await result.current.bakeCuts(PROJECT, ["tiktok"])).toEqual({});
    });
    expect(result.current.bakes("tiktok")).toBe(false);
    // Same shape: still the fallback.
    rerender({ shape: "640x480@75" });
    expect(result.current.bakes("tiktok")).toBe(false);
    // The creator trimmed the video: the cut is tried afresh.
    rerender({ shape: "640x480@60" });
    expect(result.current.bakes("tiktok")).toBe(true);
  });
});
