/**
 * prepareAgentClip — Hub canvas + ensureVariant, returns the cut row id.
 */
import { describe, expect, it, vi } from "vitest";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import { defaultWidget, emptyCanvasState, emptyScene, type CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { computeTimelineSpecHash, withBakedTimelineHash } from "@/lib/studio/baked-freshness";
import type { StudioProject } from "@/lib/services/studio-service";
import { PrepareAgentClipError, prepareAgentClip } from "@/lib/studio/prepare-agent-clip";
import type { VariantSpec } from "@shared/publish-presets";

function pitchCanvas(): CanvasState {
  const base = emptyCanvasState();
  return {
    ...base,
    scenes: [
      {
        ...emptyScene("Intro"),
        durationSeconds: 6,
        widgets: [{ ...defaultWidget("heading"), id: "h1" }],
      },
    ],
  };
}

function renderedProject(state: CanvasState, overrides: Partial<StudioProject> = {}): StudioProject {
  const spec = canvasStateToTimeline(state);
  return {
    id: "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d",
    userId: "8f2c1a9e-4b7d-4e21-9c3a-1d5e6f7a8b9c",
    title: "Maya Chen — Product Designer",
    status: "Exported",
    kind: "nle",
    mediaKind: "video",
    videoUrl: "https://cdn.hired.video/studio/8f2c/0b1c/master.mp4",
    timelineSpec: withBakedTimelineHash(spec, computeTimelineSpecHash(spec)),
    isPublic: true,
    ...overrides,
  } as StudioProject;
}

describe("prepareAgentClip", () => {
  it("renders the named cut and returns its row id", async () => {
    const project = renderedProject(pitchCanvas());
    const ensure = vi.fn(async (args: { spec: VariantSpec }) => {
      expect(args.spec.key).toBe("9x16-30s45");
      expect(args.spec.startSec).toBe(45);
      expect(args.spec.trimToSec).toBe(30);
      return { variantId: "cut-row-1", variantKey: args.spec.key, contentRevision: "r", videoId: "vid", videoUrl: null };
    });
    const id = await prepareAgentClip({
      projectId: project.id,
      variantKey: "9x16-30s45",
      includeBranding: true,
      getProject: async () => ({ data: project }),
      ensure: ensure as never,
    });
    expect(id).toBe("cut-row-1");
    expect(ensure).toHaveBeenCalledTimes(1);
  });

  it("refuses an unknown variant key without loading the project", async () => {
    const getProject = vi.fn();
    await expect(
      prepareAgentClip({
        projectId: "p1",
        variantKey: "not-a-cut",
        includeBranding: false,
        getProject,
      }),
    ).rejects.toBeInstanceOf(PrepareAgentClipError);
    expect(getProject).not.toHaveBeenCalled();
  });

  it("refuses a stale or empty project", async () => {
    const project = renderedProject(emptyCanvasState());
    await expect(
      prepareAgentClip({
        projectId: project.id,
        variantKey: "9x16-30s0",
        includeBranding: false,
        getProject: async () => ({ data: project }),
        ensure: vi.fn(),
      }),
    ).rejects.toThrow(/no cut/i);
  });

  it("throws when ensureVariant yields nothing", async () => {
    const project = renderedProject(pitchCanvas());
    await expect(
      prepareAgentClip({
        projectId: project.id,
        variantKey: "9x16-full",
        includeBranding: true,
        getProject: async () => ({ data: project }),
        ensure: async () => null,
      }),
    ).rejects.toThrow(/could not render/i);
  });
});
