/**
 * Engagement-asset widgets through the studio's timeline emitter: the video
 * export no longer throws on one, the clip carries the painter's params, it
 * round-trips back to the widget, and the painter is registered.
 */
import { describe, expect, it } from "vitest";
import "@/lib/timeline/effects";
import { getEffectDefinition } from "@/lib/timeline/effects/registry";
import { emptyCanvasState, makeEngagementAssetWidget, type CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { canvasStateToTimeline, timelineToCanvasState } from "@/lib/studio/editor-v2/timeline-emit";
import { ENGAGEMENT_ASSET_EFFECT } from "@/lib/studio/widgets/engagement-asset-params";

function withForm(): CanvasState {
  const state = emptyCanvasState();
  const form = makeEngagementAssetWidget({ assetKind: "video-form", assetId: "form-123", bgColor: "#ffffff", accentColor: "#4f46e5" });
  form.id = "w-form";
  state.scenes = [{ ...state.scenes[0], widgets: [form] }];
  return state;
}

describe("engagement-asset in the timeline", () => {
  it("emits instead of throwing, with the painter's params", () => {
    const timeline = canvasStateToTimeline(withForm());
    const clip = timeline.tracks.flatMap((t) => t.clips).find((c) => c.id === "w-form");
    expect(clip?.effects[0].kind).toBe(ENGAGEMENT_ASSET_EFFECT);
    expect(clip?.effects[0].params).toMatchObject({ assetKind: "video-form", assetId: "form-123", accentColor: "#4f46e5" });
  });

  it("round-trips back to the same widget", () => {
    const round = timelineToCanvasState(canvasStateToTimeline(withForm()));
    const widget = round.scenes[0].widgets.find((w) => w.id === "w-form");
    expect(widget?.kind).toBe("engagement-asset");
    expect(widget?.params).toEqual({
      kind: "engagement-asset",
      data: { assetKind: "video-form", assetId: "form-123", bgColor: "#ffffff", accentColor: "#4f46e5" },
    });
  });

  it("has a registered export painter", () => {
    expect(getEffectDefinition(ENGAGEMENT_ASSET_EFFECT)).not.toBeNull();
  });
});
