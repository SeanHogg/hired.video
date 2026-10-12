/**
 * Strip zoom math: the step ladder (shared nextZoom), wheel direction, the
 * zoomed track width and its tap-target floor, and the shared scene columns.
 */
import { describe, it, expect } from "vitest";
import { nextZoom } from "@/lib/build/use-preview-zoom";
import {
  SCENE_COLUMN_GAP_PX,
  SCENE_COLUMN_MIN_PX,
  STRIP_ZOOM_FIT,
  STRIP_ZOOM_STEPS,
  sceneColumnTemplate,
  stripTrackWidth,
  wheelZoomDirection,
} from "@/lib/build/use-strip-zoom";

describe("strip zoom ladder", () => {
  it("steps up and down from fit", () => {
    expect(nextZoom(STRIP_ZOOM_FIT, 1, STRIP_ZOOM_STEPS)).toBe(1.5);
    expect(nextZoom(3, -1, STRIP_ZOOM_STEPS)).toBe(2);
  });

  it("never zooms out past fit or in past the last step", () => {
    expect(nextZoom(STRIP_ZOOM_FIT, -1, STRIP_ZOOM_STEPS)).toBe(STRIP_ZOOM_FIT);
    const max = STRIP_ZOOM_STEPS[STRIP_ZOOM_STEPS.length - 1];
    expect(nextZoom(max, 1, STRIP_ZOOM_STEPS)).toBe(max);
  });
});

describe("wheelZoomDirection", () => {
  it("wheel up zooms in, down zooms out, none holds", () => {
    expect(wheelZoomDirection(-120)).toBe(1);
    expect(wheelZoomDirection(53)).toBe(-1);
    expect(wheelZoomDirection(0)).toBe(0);
  });
});

describe("stripTrackWidth", () => {
  it("is a share of the strip with a per-scene floor", () => {
    expect(stripTrackWidth(1, 5)).toEqual({ width: "100%", minWidth: `${5 * SCENE_COLUMN_MIN_PX + 4 * SCENE_COLUMN_GAP_PX}px` });
    expect(stripTrackWidth(2.5, 1).width).toBe("250%");
    expect(stripTrackWidth(1, 0).minWidth).toBe("0px");
  });
});

describe("sceneColumnTemplate", () => {
  it("sizes each scene by how long it plays, falling back to the outline", () => {
    const template = sceneColumnTemplate(
      [
        { id: "hook", duration: 4 },
        { id: "who", duration: 5 },
      ],
      [{ id: "hook", duration: 6.4 }],
    );
    expect(template).toBe(`minmax(${SCENE_COLUMN_MIN_PX}px, 6.4fr) minmax(${SCENE_COLUMN_MIN_PX}px, 5fr)`);
  });
});
