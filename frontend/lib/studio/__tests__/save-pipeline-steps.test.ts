/**
 * SaveButton step-progress regression tests. The save pipeline runs
 * Save → Generate → Render → Upload as a chain; until this hook landed
 * the user only saw a percentage during the render phase, with no
 * indication of where in the chain they were. The step list drives the
 * popover icons so each phase shows pending → active → done.
 *
 * Run: vitest run lib/studio/__tests__/save-pipeline-steps.test.ts
 */

import { describe, it, expect } from "vitest";
import { deriveSavePipelineSteps } from "@/lib/studio/save-pipeline-steps";
import type { StudioProjectState } from "@/types/studio";
import type { VideoScript } from "@/types/video-script";

const FAKE_SCRIPT: VideoScript = {
  video: {
    duration: 6, fps: 30, resolution: "720p", aspect: "16:9",
    theme: { colorPalette: ["#000"], fontFamily: "Inter", motion: "moderate", transition: "fade", background: "gradient" },
  },
  scenes: [{ id: "s", start: 0, duration: 6, type: "intro" }],
};

function makeState(overrides: Partial<StudioProjectState> = {}): StudioProjectState {
  return {
    name: "p", purpose: "resume", resumeText: "",
    model: "free", temperature: 0.7,
    resolution: "720p", aspectRatio: "16:9", targetDuration: 28, motion: "moderate",
    status: "idle",
    ...overrides,
  } as StudioProjectState;
}

function status(steps: ReturnType<typeof deriveSavePipelineSteps>) {
  return Object.fromEntries(steps.map((s) => [s.id, s.status]));
}

describe("deriveSavePipelineSteps", () => {
  it("idle on a fresh project shows everything pending", () => {
    expect(status(deriveSavePipelineSteps({ state: makeState() }))).toEqual({
      generate: "pending",
      render: "pending",
      upload: "pending",
    });
  });

  it("generating script makes Generate active and the rest pending", () => {
    expect(status(deriveSavePipelineSteps({ state: makeState({ status: "generating" }) }))).toEqual({
      generate: "active",
      render: "pending",
      upload: "pending",
    });
  });

  it("once a script exists Generate is done and Render is the next pending step", () => {
    expect(status(deriveSavePipelineSteps({ state: makeState({ script: FAKE_SCRIPT }) }))).toEqual({
      generate: "done",
      render: "pending",
      upload: "pending",
    });
  });

  it("during export, Render is active and carries the export progress", () => {
    const steps = deriveSavePipelineSteps({
      state: makeState({ status: "exporting", script: FAKE_SCRIPT }),
      exportProgress: 0.42,
    });
    expect(status(steps)).toMatchObject({ generate: "done", render: "active", upload: "pending" });
    const render = steps.find((s) => s.id === "render")!;
    expect(render.progress).toBeCloseTo(0.42);
  });

  it("Upload is active during the upload phase, with Render already done", () => {
    const steps = deriveSavePipelineSteps({
      state: makeState({ status: "uploading", script: FAKE_SCRIPT, videoBlob: new Blob() as any }),
    });
    expect(status(steps)).toEqual({
      generate: "done",
      render: "done",
      upload: "active",
    });
  });

  it("once videoUrl is set everything reads as done", () => {
    const steps = deriveSavePipelineSteps({
      state: makeState({
        status: "ready",
        script: FAKE_SCRIPT,
        videoBlob: new Blob() as any,
        videoUrl: "https://cdn/v.mp4",
      }),
    });
    expect(status(steps)).toEqual({
      generate: "done",
      render: "done",
      upload: "done",
    });
  });

  it("error during render flags Render as error (Generate still done)", () => {
    expect(status(deriveSavePipelineSteps({
      state: makeState({ status: "error", script: FAKE_SCRIPT }),
    }))).toEqual({
      generate: "done",
      render: "error",
      upload: "pending",
    });
  });

  it("error before script exists flags Generate as error", () => {
    expect(status(deriveSavePipelineSteps({
      state: makeState({ status: "error" }),
    }))).toEqual({
      generate: "error",
      render: "pending",
      upload: "pending",
    });
  });
});
