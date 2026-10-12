/**
 * #2047 — the Distribution Hub's composer pieces:
 *   - per-destination text (PRD §4.2): the shared caption is the default,
 *     an override wins, each network's own caption/title limits apply;
 *   - fitted cuts without the editor: a saved, freshly rendered video opens
 *     to the same canvas the editor shows, so a cut rendered from it carries
 *     the master's content revision (the server keeps it current); a stale
 *     master, a non-video project or an empty canvas falls back to the
 *     master.
 */
import { describe, expect, it } from "vitest";
import { destinationText } from "@/components/studio/distribution/useDestinationText";
import { hubVariantSource } from "@/components/studio/distribution/useHubCutPublisher";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import { defaultWidget, emptyCanvasState, emptyScene, type CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { projectCanvasState } from "@/lib/studio/editor-v2/project-canvas-state";
import { computeTimelineSpecHash, withBakedTimelineHash } from "@/lib/studio/baked-freshness";
import type { StudioProject } from "@/lib/services/studio-service";

describe("destinationText", () => {
  const shared = "Open to senior product design roles — 60 seconds on how I work. #design";

  it("uses the shared caption until a destination has its own", () => {
    expect(destinationText({ destination: "linkedin", lane: "self" }, shared, undefined)).toMatchObject({
      caption: shared,
      overridden: false,
      captionLimit: 3000,
      titleLimit: 200,
      problem: null,
    });
    expect(destinationText({ destination: "x", lane: "self" }, shared, { caption: "60s on how I design." })).toMatchObject({
      caption: "60s on how I design.",
      overridden: true,
    });
  });

  it("applies each network's own limits", () => {
    const long = "I design hiring tools. ".repeat(13);
    expect(destinationText({ destination: "x", lane: "self" }, long, undefined).problem).toBe("CAPTION_TOO_LONG");
    expect(destinationText({ destination: "tiktok", lane: "self" }, long, undefined).problem).toBeNull();
    expect(destinationText({ destination: "tiktok", lane: "self" }, shared, { title: "No titles on TikTok" }).problem).toBe("TITLE_NOT_SUPPORTED");
    expect(destinationText({ destination: "youtube", lane: "managed" }, shared, undefined).titleLimit).toBe(100);
    expect(destinationText({ destination: "feed", lane: "self" }, shared, undefined).titleLimit).toBeNull();
  });
});

/** A saved v2 project whose hosted MP4 was rendered from this exact timeline. */
function renderedProject(state: CanvasState, overrides: Partial<StudioProject> = {}): StudioProject {
  const spec = canvasStateToTimeline(state);
  return {
    id: "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d",
    userId: "8f2c1a9e-4b7d-4e21-9c3a-1d5e6f7a8b9c",
    title: "Maya Chen — Product Designer",
    status: "Exported",
    kind: "nle",
    mediaKind: "video",
    videoUrl: "https://cdn.hired.video/studio/8f2c/0b1c/master-1760190300000.mp4",
    timelineSpec: withBakedTimelineHash(spec, computeTimelineSpecHash(spec)),
    isPublic: true,
    ...overrides,
  } as StudioProject;
}

function pitchCanvas(): CanvasState {
  const base = emptyCanvasState();
  return {
    ...base,
    scenes: [
      { ...emptyScene("Intro"), durationSeconds: 6, widgets: [{ ...defaultWidget("heading"), id: "h1" }, { ...defaultWidget("text"), id: "t1" }] },
      { ...emptyScene("Work"), durationSeconds: 8, widgets: [{ ...defaultWidget("image"), id: "i1" }] },
    ],
  };
}

describe("hubVariantSource — fitted cuts from the Hub", () => {
  it("opens a fresh render to the editor's canvas, whose revision is the master's", () => {
    const project = renderedProject(pitchCanvas());
    const source = hubVariantSource(project, { includeBranding: true });
    expect(source).not.toBeNull();
    expect(source!.state.scenes.flatMap((s) => s.widgets.map((w) => w.id)).sort()).toEqual(["h1", "i1", "t1"]);
    // The cut's content revision = the hash the master was stamped with.
    const stamped = (project.timelineSpec as { _meta: { bakedHash: string } })._meta.bakedHash;
    expect(computeTimelineSpecHash(canvasStateToTimeline(source!.state))).toBe(stamped);
    expect(source!.includeBranding).toBe(true);
  });

  it("falls back to the master when the hosted render is stale (edited since)", () => {
    const project = renderedProject(pitchCanvas());
    const edited = { ...(project.timelineSpec as Record<string, unknown>), fps: 60 };
    expect(hubVariantSource({ ...project, timelineSpec: edited }, { includeBranding: true })).toBeNull();
  });

  it("falls back for a non-video project, an unrendered one and an empty canvas", () => {
    expect(hubVariantSource(renderedProject(pitchCanvas(), { mediaKind: "comic" }), { includeBranding: false })).toBeNull();
    expect(hubVariantSource(renderedProject(pitchCanvas(), { videoUrl: null }), { includeBranding: false })).toBeNull();
    expect(hubVariantSource(renderedProject(emptyCanvasState()), { includeBranding: false })).toBeNull();
    expect(hubVariantSource(null, { includeBranding: false })).toBeNull();
  });

  it("projectCanvasState: no saved shape → null", () => {
    expect(projectCanvasState({})).toBeNull();
  });
});
