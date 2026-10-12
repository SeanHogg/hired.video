/**
 * #2392 — inline players paint export compositor frames, not the DOM stage.
 *
 * CanvasStatePreview is a re-export of TimelineFramePreview so the public
 * watch page, marketplace TemplatePlayer, and editor overlay share one
 * compositor. CanvasStage stays the editing surface.
 *
 * Run: vitest run components/studio/v2/__tests__/canvas-state-preview.test.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import CanvasStatePreview from "../CanvasStatePreview";
import TimelineFramePreview from "../TimelineFramePreview";

const here = dirname(fileURLToPath(import.meta.url));

describe("CanvasStatePreview (#2392)", () => {
  it("is TimelineFramePreview (export compositor frames, not CanvasStage)", () => {
    expect(CanvasStatePreview).toBe(TimelineFramePreview);
  });

  it("StudioVideoSurface mounts TimelineFramePreview, not CanvasStage", () => {
    const src = readFileSync(
      join(here, "../../StudioVideoSurface.tsx"),
      "utf8",
    );
    expect(src).toMatch(
      /from ["']@\/components\/studio\/v2\/TimelineFramePreview["']/,
    );
    expect(src).not.toMatch(/CanvasStage/);
  });

  it("TimelineFramePreview marks itself as export-frames", () => {
    const src = readFileSync(join(here, "../TimelineFramePreview.tsx"), "utf8");
    expect(src).toContain('data-preview="export-frames"');
  });
});
