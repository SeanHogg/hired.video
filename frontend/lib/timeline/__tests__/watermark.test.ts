/**
 * Watermark unit tests — pin the contract that the export encoder paints
 * the "hired.video" pill at the bottom-right of every frame when the
 * caller passes `includeBranding: true`, and that the helper draws
 * NOTHING when not asked.
 *
 * The pill must be the LAST paint operation so it sits above every
 * track composite + fade-to-black transition. A regression to "paint
 * before the tracks" would let a black fade cover the branding.
 *
 * Run: vitest run lib/timeline/__tests__/watermark.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawWatermark } from "@/lib/timeline/watermark";
import { renderTimelineFrame, createRendererState } from "@/lib/timeline/frame-renderer";
import { registerEffect, _resetRegistryForTests } from "@/lib/timeline/effects/registry";
import type { Timeline } from "@shared/timeline";

interface RecordingContext {
  fillRectCalls: Array<{ x: number; y: number; w: number; h: number; style: string }>;
  fillTextCalls: Array<{ text: string; x: number; y: number; style: string }>;
}

function stubContext(): {
  ctx: CanvasRenderingContext2D;
  recording: RecordingContext;
} {
  const recording: RecordingContext = { fillRectCalls: [], fillTextCalls: [] };
  let fillStyle = "";
  const ctx = {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v: string) {
      fillStyle = v;
    },
    globalAlpha: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    fill: vi.fn(),
    fillRect: (x: number, y: number, w: number, h: number) => {
      recording.fillRectCalls.push({ x, y, w, h, style: fillStyle });
    },
    fillText: (text: string, x: number, y: number) => {
      recording.fillTextCalls.push({ text, x, y, style: fillStyle });
    },
    measureText: (s: string) => ({ width: s.length * 10 }),
    roundRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, recording };
}

describe("drawWatermark", () => {
  it("paints both `hired` and `.video` segments with the brand colour split", () => {
    const { ctx, recording } = stubContext();
    drawWatermark(ctx, { width: 1920, height: 1080 });
    const hired = recording.fillTextCalls.find((c) => c.text === "hired");
    const dotVideo = recording.fillTextCalls.find((c) => c.text === ".video");
    expect(hired).toBeDefined();
    expect(dotVideo).toBeDefined();
    expect(hired!.style).toBe("#ffffff");
    expect(dotVideo!.style).toBe("#a78bfa");
  });

  it("positions the pill at the bottom-right of the canvas", () => {
    const { ctx, recording } = stubContext();
    drawWatermark(ctx, { width: 1920, height: 1080 });
    const hired = recording.fillTextCalls.find((c) => c.text === "hired");
    expect(hired).toBeDefined();
    // Both labels should sit in the bottom-right quadrant.
    expect(hired!.x).toBeGreaterThan(1920 / 2);
    expect(hired!.y).toBeGreaterThan(1080 / 2);
  });

  it("scales the pill's font size with canvas width", () => {
    const { ctx: small } = stubContext();
    const { ctx: large } = stubContext();
    drawWatermark(small, { width: 720, height: 405 });
    drawWatermark(large, { width: 3840, height: 2160 });
    // The setter on the stub captures the last set font string; the
    // numeric size component must be larger for the 4K canvas.
    const parseFontSize = (font: string) => parseInt(font.match(/(\d+)px/)?.[1] ?? "0", 10);
    expect(parseFontSize(large.font)).toBeGreaterThan(parseFontSize(small.font));
  });
});

describe("renderTimelineFrame — includeBranding flag", () => {
  beforeEach(() => {
    _resetRegistryForTests();
    registerEffect({
      kind: "canvas-v2:background",
      label: "bg",
      category: "transform",
      defaults: {},
      apply() {
        /* no-op for this test */
      },
    });
  });

  afterEach(() => {
    _resetRegistryForTests();
  });

  function makeTimeline(): Timeline {
    return {
      schemaVersion: 1,
      fps: 30,
      width: 1920,
      height: 1080,
      backgroundColor: "#000000",
      tracks: [
        {
          id: "v1",
          kind: "video",
          label: "Background",
          gain: 1,
          pan: 0,
          muted: false,
          solo: false,
          locked: false,
          clips: [
            {
              id: "bg",
              sourceId: "",
              startFrame: 0,
              durationFrames: 30,
              sourceInFrame: 0,
              effects: [{ kind: "canvas-v2:background", params: { color: "#222" } }],
            },
          ],
        },
      ],
      markers: [],
    };
  }

  it("paints the watermark when includeBranding=true", async () => {
    const { ctx, recording } = stubContext();
    const canvas = {
      width: 1920,
      height: 1080,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
    const state = createRendererState({}, { useProxies: false });
    await renderTimelineFrame(canvas, makeTimeline(), state, 0, {
      includeBranding: true,
    });
    expect(recording.fillTextCalls.some((c) => c.text === "hired")).toBe(true);
    expect(recording.fillTextCalls.some((c) => c.text === ".video")).toBe(true);
  });

  it("omits the watermark when includeBranding is unset", async () => {
    const { ctx, recording } = stubContext();
    const canvas = {
      width: 1920,
      height: 1080,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
    const state = createRendererState({}, { useProxies: false });
    await renderTimelineFrame(canvas, makeTimeline(), state, 0);
    expect(recording.fillTextCalls.some((c) => c.text === "hired")).toBe(false);
    expect(recording.fillTextCalls.some((c) => c.text === ".video")).toBe(false);
  });

  it("omits the watermark when includeBranding=false", async () => {
    const { ctx, recording } = stubContext();
    const canvas = {
      width: 1920,
      height: 1080,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
    const state = createRendererState({}, { useProxies: false });
    await renderTimelineFrame(canvas, makeTimeline(), state, 0, {
      includeBranding: false,
    });
    expect(recording.fillTextCalls.some((c) => c.text === "hired")).toBe(false);
  });
});
