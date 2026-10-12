/**
 * Text track blocks: which widgets become blocks (skill pills grouped),
 * their windows, edge drags (snap, clamp, minimum) and retiming through the
 * plan's per-widget window overrides.
 */
import { describe, it, expect } from "vitest";
import type { VideoPlan } from "@shared/video-plan";
import type { CanvasState, Scene, Widget } from "@/lib/studio/editor-v2/canvas-state";
import { dragTextBlockEdge, retimeTextBlock, sceneTextBlocks, TEXT_BLOCK_MIN_SECONDS } from "@/lib/build/text-track";

const text = (id: string, words: string, visibleFrom: number | null, visibleTo: number | null = null): Widget =>
  ({
    id,
    kind: "text",
    position: { x: 0, y: 0, width: 0.5, height: 0.1, z: 1, rotation: 0 },
    params: { kind: "text", data: { text: words, fontPx: 40, color: "#fff", fontWeight: "bold", align: "left", background: null } },
    visibleFrom,
    visibleTo,
    motion: null,
  }) as Widget;

const scene = (id: string, durationSeconds: number, widgets: Widget[]): Scene =>
  ({ id: `build-${id}`, label: id, durationSeconds, backgroundColor: "#000", widgets }) as unknown as Scene;

// Ids and timings as video-composition.ts makes them.
const canvas = {
  scenes: [
    scene("who", 6, [
      text("build-who-decor", "", null),
      text("build-who-kicker", "WHO I AM", null),
      text("build-who-heading", "I hand back the savings.", 0.3),
      text("build-who-body-0", "Cut costs by $1.79M", 1),
      text("build-who-caption", "Based in Austin", 1.8),
    ]),
    scene("skills", 5, [
      text("build-skills-heading", "What I bring", 0.3),
      text("build-skills-skill-0", "SQL", 0.9),
      text("build-skills-skill-1", "Python", 1.12),
    ]),
  ],
  audioLayers: [],
} as unknown as CanvasState;

describe("sceneTextBlocks", () => {
  it("lists kicker, headline and lines in order — not decor or the caption", () => {
    const blocks = sceneTextBlocks(canvas, "who");
    expect(blocks.map((b) => b.kind)).toEqual(["kicker", "heading", "line"]);
    expect(blocks[1]).toMatchObject({ label: "I hand back the savings.", from: 0.3, to: 6 });
    expect(blocks[0].from).toBe(0);
  });

  it("groups a scene's skill pills into one block", () => {
    const blocks = sceneTextBlocks(canvas, "skills");
    const skills = blocks.find((b) => b.kind === "skills");
    expect(skills?.members.map((m) => m.widgetId)).toEqual(["build-skills-skill-0", "build-skills-skill-1"]);
    expect(skills?.label).toBe("SQL · Python");
    expect(skills?.from).toBe(0.9);
  });

  it("is empty for a scene the canvas doesn't have", () => {
    expect(sceneTextBlocks(canvas, "proof")).toEqual([]);
  });
});

describe("dragTextBlockEdge", () => {
  const block = { from: 1, to: 4 };
  it("snaps to tenths", () => {
    expect(dragTextBlockEdge(block, "start", 0.34, 6)).toEqual({ from: 1.3, to: 4 });
    expect(dragTextBlockEdge(block, "end", 0.96, 6)).toEqual({ from: 1, to: 5 });
  });
  it("stays inside the scene", () => {
    expect(dragTextBlockEdge(block, "start", -5, 6).from).toBe(0);
    expect(dragTextBlockEdge(block, "end", 10, 6).to).toBe(6);
  });
  it("never squeezes below the minimum", () => {
    expect(dragTextBlockEdge(block, "start", 10, 6).from).toBeCloseTo(4 - TEXT_BLOCK_MIN_SECONDS, 5);
    expect(dragTextBlockEdge(block, "end", -10, 6).to).toBeCloseTo(1 + TEXT_BLOCK_MIN_SECONDS, 5);
  });
});

describe("retimeTextBlock", () => {
  it("stores the window as the widget's override", () => {
    const heading = sceneTextBlocks(canvas, "who")[1];
    const plan = retimeTextBlock({}, heading, 0.5, 3);
    expect(plan.canvas?.widgets?.["build-who-heading"]).toEqual({ visibleFrom: 0.5, visibleTo: 3 });
  });

  it("shifts grouped starts together and keeps their stagger", () => {
    const skills = sceneTextBlocks(canvas, "skills").find((b) => b.kind === "skills")!;
    const plan: VideoPlan = retimeTextBlock({}, skills, 1.9, skills.to);
    expect(plan.canvas?.widgets?.["build-skills-skill-0"]?.visibleFrom).toBe(1.9);
    expect(plan.canvas?.widgets?.["build-skills-skill-1"]?.visibleFrom).toBeCloseTo(2.12, 5);
    expect(plan.canvas?.widgets?.["build-skills-skill-1"]?.visibleTo).toBe(5);
  });
});
