/**
 * The scene inspector's Advanced overrides reach the video: background,
 * transition, effects, font, motion and hand colours change the composed
 * script; filters, director's notes, resolution and codec change the canvas
 * the player plays and the Post dock renders. A plan without overrides
 * composes exactly as before.
 */
import { describe, expect, it } from "vitest";
import { ResumeContentSchema } from "@shared/resume";
import { patchScenePlan, type VideoPlan } from "@shared/video-plan";
import { buildVideoOutline } from "../video-outline";
import { outlineToVideoScript } from "../video-composition";
import { outlineToCanvasState } from "../video-canvas";
import { SCENE_LOOKS, DEFAULT_SCENE_LOOKS } from "../scene-palette";
import { findFontPreset } from "@/lib/studio/font-catalog";
import type { Translate } from "../video-copy";
import type { SceneElement } from "@/types/video-script";

const content = ResumeContentSchema.parse({
  basics: { name: "Sean Hogg", label: "Chief Innovation Officer", location: { city: "Detroit", region: "MI" } },
  work: [
    {
      name: "BuilderForce.ai",
      position: "Chief Innovation Officer",
      startDate: "2023-01",
      highlights: [
        "Launched an agentic AI platform that lets anyone train and deploy custom LLMs",
        "Directed a blended onshore/offshore team of 30 engineers and 5 product managers",
      ],
    },
  ],
  skills: [{ name: "AI strategy" }, { name: "Enterprise IT" }],
});

const t: Translate = (key, opts) => (opts ? `${key}|${JSON.stringify(opts)}` : key);
const FILTERS = { brightness: 1.2, contrast: 1.1, saturation: 0.8, hue: 0, blur: 0, warmth: 0.2 };

const compose = (plan: VideoPlan) => outlineToVideoScript(buildVideoOutline(content, plan), t);
const who = (plan: VideoPlan) => compose(plan).scenes[1];
const els = (plan: VideoPlan): SceneElement[] => who(plan).sceneElements ?? [];
const byId = (list: SceneElement[], id: string) => list.find((el) => el.id === id);

describe("scene overrides in the composition", () => {
  const base = compose({});

  it("composes a plan without overrides as before", () => {
    const look = SCENE_LOOKS[DEFAULT_SCENE_LOOKS.who];
    expect(base.scenes[1].accentColor).toBe(look.from);
    expect(base.scenes[1].backgroundEffect).toBe(`gradient:${look.from}:${look.to}`);
    expect(base.scenes[1].transitionIn).toBeUndefined();
    expect(base.scenes[1].effects).toBeUndefined();
    expect(base.video).toMatchObject({ fps: 30, resolution: "1080p" });
    expect(base.video.codec).toBeUndefined();
  });

  it("paints the scene with its background preset; a solid one has no effect", () => {
    const grad = who(patchScenePlan({}, "who", { background: "particles:#7c3aed" }));
    expect(grad.backgroundEffect).toBe("particles:#7c3aed");
    expect(grad.accentColor).toBe("#7c3aed");
    const solid = who(patchScenePlan({}, "who", { background: "solid:#0f172a" }));
    expect(solid.backgroundEffect).toBeUndefined();
    expect(solid.accentColor).toBe("#0f172a");
    // Other scenes keep their own ground.
    expect(compose(patchScenePlan({}, "who", { background: "solid:#0f172a" })).scenes[0].backgroundEffect).toBe(base.scenes[0].backgroundEffect);
  });

  it("carries the transition in and the effect chain", () => {
    const scene = who(patchScenePlan({}, "who", { transitionIn: "slide", effects: [{ kind: "vignette", params: { intensity: 0.4 } }] }));
    expect(scene.transitionIn).toBe("slide");
    expect(scene.effects).toEqual([{ kind: "vignette", params: { intensity: 0.4 } }]);
  });

  it("sets every text element in the chosen font, and ignores an unknown one", () => {
    const family = findFontPreset("playfair")?.family;
    const list = els(patchScenePlan({}, "who", { font: "playfair" }));
    const texts = list.filter((el) => el.kind === "text");
    expect(texts.length).toBeGreaterThan(0);
    for (const el of texts) expect(el.kind === "text" && el.fontFamily).toBe(family);
    for (const el of els(patchScenePlan({}, "who", { font: "no-such-font" }))) {
      expect(el.kind === "text" ? el.fontFamily : undefined).toBeUndefined();
    }
  });

  it("reshapes motion: cinematic is slower, minimal fades everything in faster", () => {
    const heading = byId(els({}), "build-who-heading");
    const slow = byId(els(patchScenePlan({}, "who", { motion: "cinematic" })), "build-who-heading");
    const calm = els(patchScenePlan({}, "who", { motion: "minimal" }));
    expect(slow?.motion?.enter.durationSeconds).toBeCloseTo((heading?.motion?.enter.durationSeconds ?? 0) * 1.5, 2);
    expect(slow?.appearAt).toBeCloseTo((heading?.appearAt ?? 0) * 1.5, 2);
    for (const el of calm) if (el.motion && el.motion.enter.kind !== "none") expect(el.motion.enter.kind).toBe("fade");
    expect(byId(calm, "build-who-heading")?.motion?.enter.durationSeconds).toBeLessThan(heading?.motion?.enter.durationSeconds ?? 0);
  });

  it("lays hand colours over the look", () => {
    const kicker = byId(els(patchScenePlan({}, "who", { palette: { accent: "#22c55e" } })), "build-who-kicker");
    expect(kicker?.kind === "text" && kicker.color).toBe("#22c55e");
  });

  it("scales the type with the export resolution and sets fps and codec", () => {
    const plan: VideoPlan = { export: { resolution: "4k", fps: 60, codec: "vp9" } };
    const script = compose(plan);
    expect(script.video).toMatchObject({ resolution: "4k", fps: 60, codec: "vp9" });
    const big = byId(script.scenes[1].sceneElements ?? [], "build-who-heading");
    const normal = byId(base.scenes[1].sceneElements ?? [], "build-who-heading");
    const size = (el: SceneElement | undefined) => (el?.kind === "text" ? (el.fontSize ?? 0) : 0);
    expect(size(big)).toBe(size(normal) * 2);
    expect(big?.box).toEqual(normal?.box);
  });
});

describe("scene overrides on the canvas", () => {
  it("puts filters and director's notes on their scene only", () => {
    const plan = patchScenePlan({}, "who", { filters: FILTERS, notes: "Keep it warm." });
    const canvas = outlineToCanvasState(buildVideoOutline(content, plan), t);
    const scene = canvas.scenes.find((s) => s.id === "build-who");
    expect(scene?.filters).toEqual(FILTERS);
    expect(scene?.directorNotes).toBe("Keep it warm.");
    const hook = canvas.scenes.find((s) => s.id === "build-hook");
    expect(hook?.directorNotes ?? null).toBeNull();
  });

  it("sizes the canvas by the export resolution in the video's shape, with its fps and codec", () => {
    const at = (plan: VideoPlan) => outlineToCanvasState(buildVideoOutline(content, plan), t);
    expect(at({})).toMatchObject({ width: 1920, height: 1080, fps: 30 });
    expect(at({ export: { resolution: "4k", fps: 24, codec: "h265" } })).toMatchObject({ width: 3840, height: 2160, fps: 24, codec: "h265" });
    expect(at({ aspect: "9:16", export: { resolution: "720p" } })).toMatchObject({ width: 720, height: 1280 });
  });
});
