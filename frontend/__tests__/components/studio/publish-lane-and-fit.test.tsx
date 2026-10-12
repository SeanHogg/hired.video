/**
 * Post dock (#2045): the self-gating lane chooser and the per-network fit
 * notes (shared/publish-presets), with real English copy.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";

const lane = vi.hoisted(() => ({ available: false }));

vi.mock("@/components/studio/share/usePromotionLane", () => ({
  usePromotionLane: () => ({ available: lane.available, ready: [], query: {} }),
  promotionQueryKey: (id: string | null) => ["promotions", id],
}));

import PublishLaneChooser from "@/components/studio/v2/focus/PublishLaneChooser";
import { formatClock, useChannelFit } from "@/components/studio/v2/focus/useChannelFit";

const PROJECT = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";

describe("PublishLaneChooser", () => {
  beforeEach(() => {
    lane.available = false;
  });

  it("shows only your own accounts when hired.video's channels aren't on offer", () => {
    render(<PublishLaneChooser projectId={PROJECT} self={<p>own-accounts</p>} managed={<p>brand-channels</p>} />);
    expect(screen.getByText("own-accounts")).toBeInTheDocument();
    expect(screen.queryByText("brand-channels")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("switches between the two lanes when a brand account is live", () => {
    lane.available = true;
    render(<PublishLaneChooser projectId={PROJECT} self={<p>own-accounts</p>} managed={<p>brand-channels</p>} />);
    expect(screen.getByText("own-accounts")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "hired.video's channels" }));
    expect(screen.getByText("brand-channels")).toBeInTheDocument();
    expect(screen.queryByText("own-accounts")).not.toBeInTheDocument();
  });
});

describe("formatClock", () => {
  it("formats network limits", () => {
    expect(formatClock(140)).toBe("2:20");
    expect(formatClock(600)).toBe("10:00");
    expect(formatClock(4 * 3600)).toBe("4:00:00");
    expect(formatClock(0)).toBe("0:00");
  });
});

describe("useChannelFit", () => {
  it("flags a 3-minute landscape video as too long for X and reframed for Instagram", () => {
    const { result } = renderHook(() => useChannelFit({ width: 1920, height: 1080 }, 180));
    expect(result.current.noteFor("x")).toBe("Longer than X allows (2:20) — shorten it to post here.");
    expect(result.current.noteFor("instagram")).toBe("Instagram shows 9:16 video best — this one will be letterboxed.");
    expect(result.current.noteFor("youtube")).toBeNull();
    expect(result.current.noteFor("profile")).toBeNull();
    expect(result.current.youtubeShort).toBe(false);
  });

  it("marks a vertical 45s reel as a YouTube Short", () => {
    const { result } = renderHook(() => useChannelFit({ width: 1080, height: 1920 }, 45));
    expect(result.current.youtubeShort).toBe(true);
    expect(result.current.noteFor("youtube")).toBe("Posts as a YouTube Short.");
    expect(result.current.noteFor("tiktok")).toBeNull();
  });

  it("checks duration only when the frame is unknown (boundary)", () => {
    const { result } = renderHook(() => useChannelFit(null, 60));
    expect(result.current.noteFor("instagram")).toBeNull();
    expect(result.current.youtubeShort).toBe(false);
  });
});

describe("useChannelFit — fitted cuts (#2045)", () => {
  it("names the cut a network gets when the dock will post one, instead of warning", () => {
    const { result } = renderHook(() => useChannelFit({ width: 1920, height: 1080 }, 180));
    expect(result.current.variantFor("instagram")).toEqual({ key: "9x16-full", aspect: "9:16", trimToSec: null });
    expect(result.current.variantFor("x")).toEqual({ key: "16x9-140", aspect: "16:9", trimToSec: 140 });
    expect(result.current.noteFor("instagram", true)).toBe("Instagram gets its own 9:16 cut, made when you post.");
    expect(result.current.noteFor("x", true)).toBe("X gets its own 16:9 cut, trimmed to 2:20, made when you post.");
    // The fallback when no cut can be made: the original warning.
    expect(result.current.noteFor("x", false)).toBe("Longer than X allows (2:20) — shorten it to post here.");
  });

  it("needs no cut where the master fits (boundary)", () => {
    const { result } = renderHook(() => useChannelFit({ width: 1920, height: 1080 }, 140));
    expect(result.current.variantFor("x")).toBeNull();
    expect(result.current.variantFor("youtube")).toBeNull();
    expect(result.current.noteFor("youtube", true)).toBeNull();
    expect(result.current.variantFor("profile")).toBeNull();
  });

  it("never plans a cut from an unknown length (error case)", () => {
    const { result } = renderHook(() => useChannelFit({ width: 640, height: 480 }, null));
    expect(result.current.variantFor("tiktok")).toBeNull();
  });
});
