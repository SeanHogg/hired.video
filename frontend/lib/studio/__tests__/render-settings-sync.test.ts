/**
 * Studio render-settings sync regression tests.
 *
 * Ensures the editor's StudioProjectState fields that gate the renderer
 * (aspectRatio, resolution) actually reach the script the compiler reads.
 * Before this helper landed, changing the aspect-ratio dropdown updated UI
 * state but left script.video.aspect untouched, so the preview never resized
 * and a save persisted the old value.
 *
 * Run: vitest run lib/studio/__tests__/render-settings-sync.test.ts
 */

import { describe, it, expect } from "vitest";
import { applyStateWithRenderSync } from "@/lib/studio/render-settings-sync";
import type { StudioProjectState } from "@/types/studio";
import type { VideoScript } from "@/types/video-script";

function makeScript(): VideoScript {
  return {
    video: {
      duration: 28,
      fps: 30,
      resolution: "720p",
      aspect: "16:9",
      theme: {
        colorPalette: ["#7c3aed", "#2563eb"],
        fontFamily: "Inter",
        motion: "moderate",
        transition: "fade",
        background: "gradient",
      },
    },
    scenes: [{ id: "s1", start: 0, duration: 6, type: "intro" }],
  };
}

function makeState(overrides: Partial<StudioProjectState> = {}): StudioProjectState {
  return {
    name: "draft",
    purpose: "resume",
    resumeText: "",
    model: "qwen/qwen3.6-plus:free",
    temperature: 0.7,
    resolution: "720p",
    aspectRatio: "16:9",
    targetDuration: 28,
    motion: "moderate",
    status: "ready",
    script: makeScript(),
    ...overrides,
  } as StudioProjectState;
}

describe("applyStateWithRenderSync", () => {
  it("mirrors aspectRatio onto script.video.aspect", () => {
    const { next, shouldRecompile } = applyStateWithRenderSync(makeState(), { aspectRatio: "9:16" });
    expect(next.aspectRatio).toBe("9:16");
    expect(next.script!.video.aspect).toBe("9:16");
    expect(shouldRecompile).toBe(true);
  });

  it("mirrors resolution onto script.video.resolution", () => {
    const { next, shouldRecompile } = applyStateWithRenderSync(makeState(), { resolution: "1080p" });
    expect(next.resolution).toBe("1080p");
    expect(next.script!.video.resolution).toBe("1080p");
    expect(shouldRecompile).toBe(true);
  });

  it("mirrors both fields when patched together", () => {
    const { next, shouldRecompile } = applyStateWithRenderSync(makeState(), {
      aspectRatio: "1:1",
      resolution: "4k",
    });
    expect(next.script!.video.aspect).toBe("1:1");
    expect(next.script!.video.resolution).toBe("4k");
    expect(shouldRecompile).toBe(true);
  });

  it("does not flag a recompile when render-affecting fields are unchanged", () => {
    const { next, shouldRecompile } = applyStateWithRenderSync(makeState(), { temperature: 0.9 });
    expect(next.temperature).toBe(0.9);
    expect(next.script!.video.aspect).toBe("16:9");
    expect(shouldRecompile).toBe(false);
  });

  it("does not flag a recompile when aspect is patched to the existing value", () => {
    const { shouldRecompile } = applyStateWithRenderSync(makeState(), { aspectRatio: "16:9" });
    expect(shouldRecompile).toBe(false);
  });

  it("returns the patched state without crashing when no script is loaded yet", () => {
    const { next, shouldRecompile } = applyStateWithRenderSync(
      makeState({ script: undefined }),
      { aspectRatio: "9:16" },
    );
    expect(next.aspectRatio).toBe("9:16");
    expect(next.script).toBeUndefined();
    expect(shouldRecompile).toBe(false);
  });

  it("does not mutate the previous state or script", () => {
    const prev = makeState();
    const prevScript = prev.script!;
    const prevAspect = prevScript.video.aspect;
    applyStateWithRenderSync(prev, { aspectRatio: "9:16", resolution: "1080p" });
    expect(prev.aspectRatio).toBe("16:9");
    expect(prev.resolution).toBe("720p");
    expect(prevScript.video.aspect).toBe(prevAspect);
    expect(prevScript.video.resolution).toBe("720p");
  });
});
