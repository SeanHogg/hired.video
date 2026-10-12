/**
 * Engagement zones (#1586) — read from the REAL Timeline the export paints
 * (`canvasStateToTimeline`), so the clickable box and its time window match
 * the painted card exactly. Since #2312 they are the `engagement`
 * interactions the engagement-asset plugin declares, read off the one
 * registry-driven walk (lib/studio/widgets/interactions).
 *
 * Run: vitest run lib/studio/engagement/__tests__/engagement-zones.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  emptyCanvasState,
  emptyScene,
  makeEngagementAssetWidget,
  type CanvasState,
} from "@/lib/studio/editor-v2/canvas-state";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import { extractCtaHotzones } from "@shared/cta-hotzones";
import { extractInteractionZones } from "@/lib/studio/widgets/interactions";
import { hasInteractiveWidget } from "@/lib/studio/widgets/use-interaction-zones";
import { activeEngagementZones, engagementZonesOf, extractEngagementZones, gatingFormZone } from "../engagement-zones";

// Ids shaped like the studio_video_forms / studio_chapters uuids.
const FORM_ID = "3f6c1d2e-8a41-4b6f-9a0e-2d5c7b9e1a44";
const CHAPTER_ID = "a2b9e4c1-5d7f-4e2a-8c3b-6f1d0e9a7b55";

/** Two 5 s scenes: a lead form shown 1–4 s into scene 1, and a chapter
 *  marker across all of scene 2 — the layout a "watch then sign up" video
 *  ships with. */
function twoSceneState(): CanvasState {
  const state = emptyCanvasState({ width: 1080, height: 1920, fps: 30 });
  const form = makeEngagementAssetWidget({ assetKind: "video-form", assetId: FORM_ID });
  form.visibleFrom = 1;
  form.visibleTo = 4;
  form.position = { x: 0.1, y: 0.55, width: 0.8, height: 0.3, z: 2, rotation: 0 };
  const chapter = makeEngagementAssetWidget({ assetKind: "chapter-marker", assetId: CHAPTER_ID });
  const unbound = makeEngagementAssetWidget({ assetKind: "review-pin", assetId: "" });
  state.scenes[0].widgets = [form, unbound];
  const second = emptyScene("Scene 2");
  second.widgets = [chapter];
  state.scenes.push(second);
  return state;
}

describe("extractEngagementZones", () => {
  it("emits one zone per bound widget with the painted rect and its absolute time window", () => {
    // Zones come out in paint (z) order — the overlay stacks its controls the
    // same way — so compare them in time order.
    const zones = extractEngagementZones(canvasStateToTimeline(twoSceneState())).sort(
      (a, b) => a.startSec - b.startSec,
    );
    expect(zones.map((z) => [z.kind, z.assetId])).toEqual([
      ["video-form", FORM_ID],
      ["chapter-marker", CHAPTER_ID],
    ]);
    const [form, chapter] = zones;
    expect(form).toMatchObject({ startSec: 1, endSec: 4, x: 0.1, y: 0.55, w: 0.8, h: 0.3 });
    expect(chapter).toMatchObject({ startSec: 5, endSec: 10, x: 0.25, y: 0.25, w: 0.4, h: 0.4 });
  });

  it("ignores unbound widgets, other effect kinds and malformed timelines", () => {
    expect(extractEngagementZones(null)).toEqual([]);
    expect(extractEngagementZones({ tracks: "nope" } as never)).toEqual([]);
    const state = emptyCanvasState();
    state.scenes[0].widgets = [makeEngagementAssetWidget({ assetKind: "video-form", assetId: "" })];
    expect(hasInteractiveWidget(state)).toBe(false);
    expect(extractEngagementZones(canvasStateToTimeline(state))).toEqual([]);
    // The shared walk still serves CTA hot-zones unchanged.
    expect(extractCtaHotzones(canvasStateToTimeline(twoSceneState()))).toEqual([]);
  });

  it("is the engagement projection of the shared interaction walk", () => {
    const timeline = canvasStateToTimeline(twoSceneState());
    expect(extractEngagementZones(timeline)).toEqual(engagementZonesOf(extractInteractionZones(timeline)));
    expect(hasInteractiveWidget(twoSceneState())).toBe(true);
  });

  it("skips an engagement effect whose saved kind is unknown (never coerced to a form)", () => {
    const timeline = canvasStateToTimeline(twoSceneState());
    const clip = timeline.tracks.find((t) => t.id === "v2")!.clips.find((c) => c.effects?.[0]?.params?.assetId === FORM_ID)!;
    clip.effects![0].params = { ...clip.effects![0].params, assetKind: "nps-survey" };
    expect(extractEngagementZones(timeline).map((z) => z.kind)).toEqual(["chapter-marker"]);
  });

  it("windows are start-inclusive, end-exclusive", () => {
    const zones = extractEngagementZones(canvasStateToTimeline(twoSceneState()));
    expect(activeEngagementZones(zones, 0.99)).toEqual([]);
    expect(activeEngagementZones(zones, 1).map((z) => z.kind)).toEqual(["video-form"]);
    expect(activeEngagementZones(zones, 4).map((z) => z.kind)).toEqual([]);
    expect(activeEngagementZones(zones, 5).map((z) => z.kind)).toEqual(["chapter-marker"]);
  });
});

describe("gatingFormZone (requireToContinue)", () => {
  const zones = extractEngagementZones(canvasStateToTimeline(twoSceneState()));
  const required = (id: string) => id === FORM_ID;

  it("gates while a required, unsubmitted form is on screen", () => {
    expect(gatingFormZone(zones, 2, required, new Set())?.assetId).toBe(FORM_ID);
  });

  it("releases once submitted, outside the window, or when the form is skippable / still loading", () => {
    expect(gatingFormZone(zones, 2, required, new Set([FORM_ID]))).toBeNull();
    expect(gatingFormZone(zones, 4.5, required, new Set())).toBeNull();
    expect(gatingFormZone(zones, 2, () => false, new Set())).toBeNull();
  });
});
