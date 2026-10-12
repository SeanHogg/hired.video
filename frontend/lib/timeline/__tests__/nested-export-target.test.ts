/**
 * Nested timelines inherit the export target (#2312): when the parent is an
 * export render copy (`withExportTarget`), a nested timeline's widgets are
 * stamped too, so a CTA inside a nested sequence still paints its link + QR
 * in the file. An interactive parent (preview) leaves the child untouched.
 *
 * Run: vitest run lib/timeline/__tests__/nested-export-target.test.ts
 */
import { describe, expect, it } from "vitest";
import type { Timeline } from "@shared/timeline";
import { defaultWidget, emptyCanvasState, type WidgetKind } from "@/lib/studio/editor-v2/canvas-state";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import { isExportTimeline, withExportTarget } from "@/lib/studio/widgets/export-target";
import { createRendererState, preloadSources } from "../frame-renderer";

const JOB_URL = "https://hired.video/jobs/senior-product-designer-remote";

function timelineWith(kind: WidgetKind): Timeline {
  const state = emptyCanvasState({ width: 1920, height: 1080, fps: 30 });
  const widget = defaultWidget(kind);
  if (widget.params.kind === "cta") widget.params.data.ctaUrl = JOB_URL;
  state.scenes[0].widgets = [widget];
  return canvasStateToTimeline(state);
}

/** A parent with a heading plus a clip that plays the nested "reel-intro". */
function parentWithNested(): Timeline {
  const parent = timelineWith("heading");
  const track = parent.tracks.find((t) => t.kind === "video");
  if (!track) throw new Error("no video track");
  track.clips.push({ id: "nested", sourceId: "", nestedTimelineId: "reel-intro", startFrame: 0, durationFrames: 30, sourceInFrame: 0 });
  return parent;
}

async function nestedChild(parent: Timeline) {
  const child = timelineWith("cta");
  const state = createRendererState({}, { resolveNestedTimeline: async () => ({ timeline: child, sources: {} }) });
  await preloadSources(parent, state);
  return { state, child, rendered: state.nestedTimelines.get("reel-intro") };
}

describe("nested timelines and the export target", () => {
  it("an export parent stamps its nested timeline", async () => {
    const { state, child, rendered } = await nestedChild(await withExportTarget(parentWithNested()));
    expect(state.exportTarget).toBe(true);
    expect(state.nestedStates.get("reel-intro")?.exportTarget).toBe(true);
    expect(rendered && isExportTimeline(rendered)).toBe(true);
    // The resolver's timeline is never mutated.
    expect(isExportTimeline(child)).toBe(false);
  });

  it("an interactive parent leaves the nested timeline interactive", async () => {
    const { state, rendered } = await nestedChild(parentWithNested());
    expect(state.exportTarget).toBe(false);
    expect(rendered && isExportTimeline(rendered)).toBe(false);
  });
});
