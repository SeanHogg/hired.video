/**
 * Compiler regression tests around the aspect-ratio + resolution path.
 *
 * Until these landed, the only way the studio's aspect-ratio dropdown could
 * affect a render was via the script that the compiler reads — and nothing
 * verified that resolveSize honoured the user's choice. The audit found that
 * changing `aspectRatio` in StudioProjectState never reached `script.video.aspect`,
 * so the preview kept its 16:9 frame even after the user picked 9:16. The
 * StudioLayout fix mirrors aspect/resolution onto the script; these tests
 * pin the compiler-side guarantee so a future regression fails loudly.
 *
 * Run: vitest run lib/compiler/__tests__/video-compiler.test.ts
 */

import { describe, it, expect } from "vitest";
import { compile } from "@/lib/compiler/video-compiler";
import type { VideoScript, VideoAspect, VideoResolution } from "@/types/video-script";

function makeScript(aspect: VideoAspect, resolution: VideoResolution): VideoScript {
  return {
    video: {
      duration: 6,
      fps: 30,
      resolution,
      aspect,
      theme: {
        colorPalette: ["#7c3aed", "#2563eb"],
        fontFamily: "Inter",
        motion: "moderate",
        transition: "fade",
        background: "gradient",
      },
    },
    scenes: [
      { id: "s1", start: 0, duration: 6, type: "intro" },
    ],
  };
}

describe("video-compiler aspect + resolution", () => {
  it("compiles 16:9 / 720p to 1280×720", () => {
    const cv = compile(makeScript("16:9", "720p"), { includeBranding: false });
    expect(cv.width).toBe(1280);
    expect(cv.height).toBe(720);
  });

  it("compiles 9:16 / 720p to portrait 405×720", () => {
    const cv = compile(makeScript("9:16", "720p"), { includeBranding: false });
    expect(cv.height).toBe(720);
    expect(cv.width).toBe(405);
    expect(cv.width).toBeLessThan(cv.height);
  });

  it("compiles 1:1 / 1080p to a square 1080×1080", () => {
    const cv = compile(makeScript("1:1", "1080p"), { includeBranding: false });
    expect(cv.width).toBe(1080);
    expect(cv.height).toBe(1080);
  });

  it("compiles 4:3 / 1080p to 1440×1080", () => {
    const cv = compile(makeScript("4:3", "1080p"), { includeBranding: false });
    expect(cv.width).toBe(1440);
    expect(cv.height).toBe(1080);
  });

  it("changes width when aspect is flipped at the same resolution", () => {
    const landscape = compile(makeScript("16:9", "1080p"), { includeBranding: false });
    const portrait  = compile(makeScript("9:16", "1080p"), { includeBranding: false });
    expect(landscape.width).toBeGreaterThan(landscape.height);
    expect(portrait.width).toBeLessThan(portrait.height);
    expect(landscape.height).toBe(portrait.height); // resolution = short side
  });
});

describe("video-compiler branding cards (timeline)", () => {
  it("does NOT prepend an intro card when includeBranding is true (now player-only)", () => {
    const cv = compile(makeScript("16:9", "720p"), { includeBranding: true });
    expect(cv.scenes).toHaveLength(1);
    expect(cv.scenes[0].id).toBe("s1");
    expect(cv.scenes[0].start).toBe(0);
  });

  it("does NOT append an outro card when includeBranding is true", () => {
    const cv = compile(makeScript("16:9", "720p"), { includeBranding: true });
    expect(cv.scenes.some((s) => s.id.startsWith("brand-"))).toBe(false);
  });

  it("totalDuration matches the user's content exactly (no branding seconds)", () => {
    const cv = compile(makeScript("16:9", "720p"), { includeBranding: true });
    // Single 6-second scene → no extra time stolen by intro (1.5s) or outro (2.0s).
    expect(cv.totalDuration).toBe(6);
  });

  it("still surfaces includeBranding so the renderer can gate the corner watermark", () => {
    const withBranding = compile(makeScript("16:9", "720p"), { includeBranding: true });
    const noBranding   = compile(makeScript("16:9", "720p"), { includeBranding: false });
    expect(withBranding.includeBranding).toBe(true);
    expect(noBranding.includeBranding).toBe(false);
    // Scene timeline is identical regardless — branding is a player concern now.
    expect(withBranding.totalDuration).toBe(noBranding.totalDuration);
  });
});
