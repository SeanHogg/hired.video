/**
 * Fitted cuts (#2045): reframing a composition to another aspect and
 * trimming its Timeline. Fixtures mirror what the studio saves: a 1920x1080
 * pitch with a full-bleed webcam recording, a heading and a CTA, and a
 * 30 fps Timeline with a recording track, a music bed, chapter markers and
 * a scene dissolve.
 */
import { describe, expect, it } from "vitest";
import type { Timeline } from "@shared/timeline";
import { defaultWidget, emptyCanvasState, makeRecordingScene, type CanvasState } from "../canvas-state";
import { reframeCanvasState, trimTimeline, variantFrame } from "../variant-timeline";

function pitch(): CanvasState {
  const state = emptyCanvasState({ width: 1920, height: 1080 });
  const recording = makeRecordingScene("Intro take", "https://cdn.hired.video/studio/u/p/take-1.webm", 42);
  const heading = defaultWidget("heading"); // x .1 y .1 w .6 h .18, 72px
  if (heading.params.kind === "heading") heading.params.data.text = "Dana Reyes — Product Designer";
  heading.containerStyle = { backgroundColor: "#0f172a", borderRadius: 12, padding: 16 };
  recording.widgets.push(heading);
  return { ...state, scenes: [recording] };
}

describe("variantFrame", () => {
  it("keeps the master's short side and rounds to even pixels", () => {
    expect(variantFrame({ width: 1920, height: 1080 }, "9:16")).toEqual({ width: 1080, height: 1920 });
    expect(variantFrame({ width: 1920, height: 1080 }, "1:1")).toEqual({ width: 1080, height: 1080 });
    expect(variantFrame({ width: 1920, height: 1080 }, "4:5")).toEqual({ width: 1080, height: 1350 });
    expect(variantFrame({ width: 1080, height: 1920 }, "16:9")).toEqual({ width: 1920, height: 1080 });
    // 4:3 webcam frame → 9:16: 480 * 16/9 = 853.3 → 854 (H.264 needs even sizes).
    expect(variantFrame({ width: 640, height: 480 }, "9:16")).toEqual({ width: 480, height: 854 });
  });
});

describe("reframeCanvasState", () => {
  it("covers the frame with a full-bleed recording and fits the heading inside it", () => {
    const master = pitch();
    const cut = reframeCanvasState(master, "9:16");
    expect(cut.width).toBe(1080);
    expect(cut.height).toBe(1920);

    const [video, heading] = cut.scenes[0].widgets;
    // COVER: scaled by 1920/1080, centred — fills the height, crops the sides.
    expect(video.position.height).toBeCloseTo(1, 5);
    expect(video.position.y).toBeCloseTo(0, 5);
    expect(video.position.width).toBeCloseTo((1920 * (1920 / 1080)) / 1080, 5);
    expect(video.position.x + video.position.width / 2).toBeCloseTo(0.5, 5);

    // FIT: scaled by 1080/1920 = 0.5625 about the centre — whole, on-frame.
    const s = 1080 / 1920;
    expect(heading.position.width).toBeCloseTo((0.6 * 1920 * s) / 1080, 5);
    expect(heading.position.x).toBeGreaterThanOrEqual(0);
    expect(heading.position.x + heading.position.width).toBeLessThanOrEqual(1);
    expect(heading.position.y).toBeGreaterThan(0);
    expect(heading.position.y + heading.position.height).toBeLessThan(1);
    // Pixel-sized params scale with the rect, so the line breaks stay put.
    expect(heading.params.kind === "heading" && heading.params.data.fontPx).toBeCloseTo(72 * s, 5);
    expect(heading.containerStyle).toEqual({ backgroundColor: "#0f172a", borderRadius: 12 * s, padding: 16 * s });
    expect(heading.position.rotation).toBe(0);
  });

  it("never mutates the saved state", () => {
    const master = pitch();
    const before = JSON.stringify(master);
    reframeCanvasState(master, "1:1");
    expect(JSON.stringify(master)).toBe(before);
  });

  it("returns the master untouched when it is already that frame (boundary)", () => {
    const master = pitch();
    expect(reframeCanvasState(master, "16:9")).toBe(master);
  });
});

function timeline(): Timeline {
  const track = { gain: 1, pan: 0, muted: false, solo: false, locked: false };
  return {
    schemaVersion: 1,
    fps: 30,
    width: 1920,
    height: 1080,
    backgroundColor: "#000000",
    tracks: [
      {
        ...track,
        id: "v1",
        kind: "video",
        label: "Scenes",
        clips: [
          { id: "c1", sourceId: "take-1", startFrame: 0, durationFrames: 2400, sourceInFrame: 0, outTransition: { kind: "cross-dissolve", durationFrames: 15 } },
          { id: "c2", sourceId: "take-2", startFrame: 2400, durationFrames: 3000, sourceInFrame: 0 },
          { id: "c3", sourceId: "outro", startFrame: 5400, durationFrames: 1800, sourceInFrame: 0 },
        ],
      },
      {
        ...track,
        id: "a1",
        kind: "audio",
        label: "Music",
        clips: [{ id: "m1", sourceId: "bed", startFrame: 0, durationFrames: 7200, sourceInFrame: 0, fadeInFrames: 30, fadeOutFrames: 60 }],
      },
    ],
    markers: [
      { id: "k1", frame: 0, label: "Intro" },
      { id: "k2", frame: 5400, label: "Outro" },
    ],
    sceneTransitions: [
      { atFrame: 2400, kind: "cross-dissolve", durationFrames: 15 },
      { atFrame: 5400, kind: "fade-to-black", durationFrames: 15 },
    ],
  };
}

describe("trimTimeline", () => {
  it("cuts a 4-minute pitch to X's 140 s: drops late clips, shortens the crossing one, fades the music", () => {
    const cut = trimTimeline(timeline(), 140); // 4200 frames
    const [video, music] = cut.tracks;
    expect(video.clips.map((c) => [c.id, c.startFrame, c.durationFrames])).toEqual([
      ["c1", 0, 2400],
      ["c2", 2400, 1800],
    ]);
    // The first clip keeps its dissolve; the cut clip has nothing to dissolve into.
    expect(video.clips[0].outTransition).toEqual({ kind: "cross-dissolve", durationFrames: 15 });
    expect(video.clips[1].outTransition).toBeUndefined();
    expect(music.clips[0]).toMatchObject({ durationFrames: 4200, fadeInFrames: 30, fadeOutFrames: 60 });
    expect(cut.markers?.map((m) => m.id)).toEqual(["k1"]);
    expect(cut.sceneTransitions?.map((t) => t.atFrame)).toEqual([2400]);
  });

  it("gives a cut audio clip at least a half-second fade so it doesn't click", () => {
    const base = timeline();
    base.tracks[1].clips[0].fadeOutFrames = undefined;
    const cut = trimTimeline(base, 60);
    expect(cut.tracks[1].clips[0]).toMatchObject({ durationFrames: 1800, fadeOutFrames: 15 });
  });

  it("leaves a timeline that already fits untouched, exactly at the limit (boundary)", () => {
    const base = timeline();
    expect(trimTimeline(base, 240).tracks).toEqual(base.tracks);
    expect(trimTimeline(base, null)).toBe(base);
  });

  it("ignores a non-positive cut instead of emptying the video (error case)", () => {
    const base = timeline();
    expect(trimTimeline(base, 0)).toBe(base);
    expect(trimTimeline(base, -5)).toBe(base);
    expect(trimTimeline(base, Number.NaN)).toBe(base);
  });

  it("windows a mid-video clip: shifts startFrame and sourceInFrame so the cut is not the opening", () => {
    const cut = trimTimeline(timeline(), 60, 80); // 80s–140s → frames 2400–4200
    const [video, music] = cut.tracks;
    expect(video.clips.map((c) => [c.id, c.startFrame, c.durationFrames, c.sourceInFrame])).toEqual([
      ["c2", 0, 1800, 0],
    ]);
    expect(music.clips[0]).toMatchObject({ startFrame: 0, durationFrames: 1800, sourceInFrame: 2400 });
    expect(cut.markers).toEqual([]);
    expect(cut.sceneTransitions?.map((t) => t.atFrame)).toEqual([0]);
  });
});
