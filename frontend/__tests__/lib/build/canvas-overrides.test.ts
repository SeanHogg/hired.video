/**
 * Canvas overrides — the owner's frame-level hand edits, stored on the video
 * plan and layered over the canvas derived from a real résumé: moves, hides,
 * added widgets and wording land on the right widget; edits for widgets the
 * résumé no longer produces are ignored; the patch helpers leave no empty
 * keys behind; and the stored shape validates (and is capped).
 */
import { describe, it, expect } from "vitest";
import { ResumeContentSchema, type ResumeContent } from "@shared/resume";
import { VideoPlanSchema, ADDED_WIDGETS_MAX, WIDGET_LOOK_JSON_MAX, type VideoPlan } from "@shared/video-plan";
import { buildVideoOutline } from "@/lib/build/video-outline";
import { outlineToCanvasState } from "@/lib/build/video-canvas";
import type { Translate } from "@/lib/build/video-copy";
import { defaultWidget, type CanvasState, type Widget, type WidgetPosition } from "@/lib/studio/editor-v2/canvas-state";
import {
  addWidget,
  applyCanvasOverrides,
  hasCanvasOverrides,
  overrideWidgetLook,
  overrideWidgetPosition,
  overrideWidgetText,
  overrideWidgetWindow,
  removeWidget,
  resetCanvasOverrides,
  videoSceneIdOfCanvasScene,
} from "@/lib/build/canvas-overrides";
import {
  MUSIC_LAYER_ID,
  applyMusicMix,
  mixMusicTiming,
  musicVolume,
  removeMusic,
  setMusicVolume,
} from "@/lib/build/music-mix";

const content: ResumeContent = ResumeContentSchema.parse({
  basics: {
    name: "Dana Okafor",
    label: "Product Designer",
    summary: "Designer who ships. Former ICU nurse.",
    location: { city: "Detroit", region: "MI", countryCode: "US" },
  },
  work: [
    { name: "Beaumont Hospital", position: "Registered Nurse", startDate: "2014", endDate: "2021-12", highlights: ["Precepted new grads"] },
    {
      id: "c0ffee00-0000-4000-8000-000000000042",
      name: "Hinge Health",
      position: "Senior Product Designer",
      startDate: "2022-01",
      endDate: "Present",
      highlights: ["Owned the onboarding redesign end to end", "Lifted 30-day activation 22% with a guided first session"],
    },
  ],
  skills: [{ name: "Figma", keywords: ["Prototyping"] }, { name: "User research" }],
});

const t: Translate = (key, opts) => (opts ? `${key}|${JSON.stringify(opts)}` : key);
const derived = (): CanvasState => outlineToCanvasState(buildVideoOutline(content), t);

const findWidget = (canvas: CanvasState, id: string): Widget | undefined =>
  canvas.scenes.flatMap((s) => s.widgets).find((w) => w.id === id);
const sceneOf = (canvas: CanvasState, id: string) => canvas.scenes.find((s) => s.widgets.some((w) => w.id === id))?.id;
const textOf = (w: Widget | undefined): string | undefined =>
  w && (w.params.kind === "text" || w.params.kind === "heading") ? w.params.data.text : undefined;

const MOVED: WidgetPosition = { x: 0.1, y: 0.2, width: 0.5, height: 0.15, z: 7, rotation: 12 };

describe("applyCanvasOverrides", () => {
  const base = derived();

  it("derives the widgets the overrides are keyed by", () => {
    expect(findWidget(base, "build-proof-heading")).toBeDefined();
    expect(base.scenes.map((s) => videoSceneIdOfCanvasScene(s.id))).not.toContain(null);
  });

  it("moves a widget, without touching the derived canvas", () => {
    const plan = overrideWidgetPosition({}, "build-proof-heading", MOVED);
    const out = applyCanvasOverrides(base, plan.canvas);
    expect(findWidget(out, "build-proof-heading")?.position).toEqual(MOVED);
    expect(findWidget(base, "build-proof-heading")?.position).not.toEqual(MOVED);
  });

  it("retimes a widget within its scene", () => {
    const plan = overrideWidgetWindow({}, "build-proof-heading", 1, 3.5);
    const w = findWidget(applyCanvasOverrides(base, plan.canvas), "build-proof-heading");
    expect([w?.visibleFrom, w?.visibleTo]).toEqual([1, 3.5]);
  });

  it("replaces a text widget's wording", () => {
    const plan = overrideWidgetText({}, "build-proof-heading", "Ten years of shipping");
    expect(textOf(findWidget(applyCanvasOverrides(base, plan.canvas), "build-proof-heading"))).toBe("Ten years of shipping");
  });

  it("hides a removed derived widget", () => {
    const plan = removeWidget({}, "build-proof-heading");
    expect(plan.canvas?.widgets?.["build-proof-heading"]).toEqual({ hidden: true });
    expect(findWidget(applyCanvasOverrides(base, plan.canvas), "build-proof-heading")).toBeUndefined();
  });

  it("adds a dropped-in widget to its scene, and can then move or drop it", () => {
    const sticker: Widget = { ...defaultWidget("text"), id: "owner-note-1" };
    let plan = addWidget({}, "skills", sticker);
    let out = applyCanvasOverrides(base, plan.canvas);
    expect(sceneOf(out, "owner-note-1")).toBe("build-skills");

    plan = overrideWidgetPosition(plan, "owner-note-1", MOVED);
    expect(findWidget(applyCanvasOverrides(base, plan.canvas), "owner-note-1")?.position).toEqual(MOVED);

    plan = removeWidget(plan, "owner-note-1");
    expect(plan).toEqual({});
    out = applyCanvasOverrides(base, plan.canvas);
    expect(findWidget(out, "owner-note-1")).toBeUndefined();
  });

  it("ignores overrides for widgets the résumé no longer produces", () => {
    const plan = overrideWidgetPosition(removeWidget({}, "build-proof-body-9"), "gone", MOVED);
    expect(applyCanvasOverrides(base, plan.canvas)).toEqual(base);
    expect(applyCanvasOverrides(base, undefined)).toBe(base);
  });
});

describe("canvas override patch helpers", () => {
  it("prune empties and keep the rest of the plan", () => {
    const plan: VideoPlan = { music: "none" };
    const edited = overrideWidgetText(plan, "build-hook-heading", "Hi");
    expect(hasCanvasOverrides(edited)).toBe(true);
    expect(edited.music).toBe("none");
    expect(resetCanvasOverrides(edited)).toEqual({ music: "none" });
    expect(hasCanvasOverrides(plan)).toBe(false);
    expect(hasCanvasOverrides({ canvas: { widgets: {}, added: { proof: [] } } })).toBe(false);
  });

  it("maps canvas scene ids back to plan scene ids", () => {
    expect(videoSceneIdOfCanvasScene("build-proof")).toBe("proof");
    expect(videoSceneIdOfCanvasScene("build-resume")).toBeNull();
    expect(videoSceneIdOfCanvasScene("proof")).toBeNull();
  });
});

describe("VideoPlanSchema canvas key", () => {
  it("round-trips the helpers' output", () => {
    let plan = overrideWidgetPosition({}, "build-proof-heading", MOVED);
    plan = overrideWidgetWindow(plan, "build-who-avatar", null, 2);
    plan = removeWidget(plan, "build-proof-page-role-1");
    plan = addWidget(plan, "next", { ...defaultWidget("heading"), id: "owner-cta" });
    const parsed = VideoPlanSchema.safeParse(JSON.parse(JSON.stringify(plan)));
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(JSON.parse(JSON.stringify(plan)));
  });

  it("rejects more than the cap of added widgets in one scene, and unknown fields", () => {
    const many = Array.from({ length: ADDED_WIDGETS_MAX + 1 }, (_, i) => ({ id: `w${i}`, kind: "text" }));
    expect(VideoPlanSchema.safeParse({ canvas: { added: { proof: many } } }).success).toBe(false);
    expect(VideoPlanSchema.safeParse({ canvas: { added: { proof: many.slice(1) } } }).success).toBe(true);
    expect(VideoPlanSchema.safeParse({ canvas: { widgets: { a: { colour: "red" } } } }).success).toBe(false);
    expect(VideoPlanSchema.safeParse({ canvas: { added: { resume: [] } } }).success).toBe(false);
  });
});

describe("look overrides on résumé-made widgets", () => {
  const base = derived();
  const motion = {
    enter: { kind: "slide-up" as const, durationSeconds: 0.6, easing: "ease-out" as const },
    exit: { kind: "fade" as const, durationSeconds: 0.3, easing: "ease-in" as const },
  };

  it("merges a params patch into the widget's data and replaces motion / container / effects", () => {
    let plan = overrideWidgetLook({}, "build-proof-heading", { params: { color: "#ff0000" } });
    plan = overrideWidgetLook(plan, "build-proof-heading", { params: { fontPx: 40 }, motion });
    plan = overrideWidgetLook(plan, "build-proof-heading", {
      containerStyle: { backgroundColor: "#000000", padding: 8 },
      effects: [{ kind: "glow", params: { radius: 4 } }],
    });
    expect(plan.canvas?.widgets?.["build-proof-heading"]?.params).toEqual({ color: "#ff0000", fontPx: 40 });

    const before = findWidget(base, "build-proof-heading");
    const out = findWidget(applyCanvasOverrides(base, plan.canvas), "build-proof-heading");
    if (!out || (out.params.kind !== "heading" && out.params.kind !== "text")) throw new Error("heading is text");
    expect(out.params.data.color).toBe("#ff0000");
    expect(out.params.data.fontPx).toBe(40);
    expect(out.params.kind).toBe(before?.params.kind);
    expect(textOf(out)).toBe(textOf(before));
    expect(out.motion).toEqual(motion);
    expect(out.containerStyle).toEqual({ backgroundColor: "#000000", padding: 8 });
    expect(out.effects).toEqual([{ kind: "glow", params: { radius: 4 } }]);
    // The derived canvas is untouched.
    expect(findWidget(base, "build-proof-heading")).toEqual(before);
  });

  it("keeps the owner's wording over a params patch", () => {
    let plan = overrideWidgetText({}, "build-proof-heading", "Mine");
    plan = overrideWidgetLook(plan, "build-proof-heading", { params: { text: "Not mine", color: "#00ff00" } });
    expect(textOf(findWidget(applyCanvasOverrides(base, plan.canvas), "build-proof-heading"))).toBe("Mine");
  });

  it("does not store a look over the size budget, and a removal drops the look", () => {
    const huge = { image: "x".repeat(WIDGET_LOOK_JSON_MAX + 1) };
    expect(overrideWidgetLook({}, "build-who-avatar", { params: huge })).toEqual({});
    const styled = overrideWidgetLook({}, "build-proof-heading", { motion: null });
    expect(styled.canvas?.widgets?.["build-proof-heading"]).toEqual({ motion: null });
    expect(removeWidget(styled, "build-proof-heading").canvas?.widgets?.["build-proof-heading"]).toEqual({ hidden: true });
  });

  it("round-trips through the schema", () => {
    const plan = overrideWidgetLook({}, "build-proof-heading", {
      params: { color: "#123456" },
      motion,
      containerStyle: { borderWidth: 2 },
      effects: [{ kind: "blur", params: { amount: 2 } }],
    });
    const parsed = VideoPlanSchema.safeParse(JSON.parse(JSON.stringify(plan)));
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(plan);
  });
});

describe("music mix", () => {
  const base = derived();
  const music = (canvas: CanvasState) => canvas.audioLayers.find((l) => l.kind === "music");

  it("gives the derived music layer a stable id, and applies the owner's mix to it", () => {
    expect(music(base)).toBeDefined();
    expect(music(applyMusicMix(base, undefined))?.id).toBe(MUSIC_LAYER_ID);

    let plan = mixMusicTiming({}, { startOffsetSec: 1.5, trimStartSec: 2, trimEndSec: 1, fadeInSec: 0.5, fadeOutSec: 2 });
    plan = setMusicVolume(plan, 0.35);
    expect(plan.musicMix).toEqual({ startOffsetSec: 1.5, trimStartSec: 2, trimEndSec: 1, fadeInSec: 0.5, fadeOutSec: 2, volume: 0.35 });
    const layer = music(applyMusicMix(base, plan.musicMix));
    expect(layer).toMatchObject({
      id: MUSIC_LAYER_ID,
      startOffsetSec: 1.5,
      trimStartSec: 2,
      trimEndSec: 1,
      fadeInSec: 0.5,
      fadeOutSec: 2,
      gain: 0.35,
    });
    expect(musicVolume(plan)).toBe(0.35);
    // Voiceover / other layers are left alone, and the input isn't touched.
    expect(music(base)?.gain).toBe(1);
  });

  it("clamps a drag to the schema's bounds, and never trims the music away", () => {
    const plan = mixMusicTiming({}, { startOffsetSec: -3, fadeInSec: 99, trimStartSec: 10_000 });
    expect(plan.musicMix).toEqual({ startOffsetSec: 0, fadeInSec: 30, trimStartSec: 600 });
    expect(VideoPlanSchema.safeParse(plan).success).toBe(true);
    const layer = music(applyMusicMix(base, plan.musicMix));
    expect(layer && layer.durationSeconds - layer.trimStartSec - layer.trimEndSec).toBeGreaterThan(0);
  });

  it("full volume clears the key; remove goes silent and drops the mix", () => {
    expect(setMusicVolume({ music: "lofi" }, 1)).toEqual({ music: "lofi" });
    expect(removeMusic(setMusicVolume({ music: "lofi" }, 0.2))).toEqual({ music: "none" });
    expect(applyMusicMix({ ...base, audioLayers: [] }, { volume: 0.2 }).audioLayers).toEqual([]);
  });

  it("schema rejects an out-of-range volume or unknown mix fields", () => {
    expect(VideoPlanSchema.safeParse({ musicMix: { volume: 1.5 } }).success).toBe(false);
    expect(VideoPlanSchema.safeParse({ musicMix: { volume: -0.1 } }).success).toBe(false);
    expect(VideoPlanSchema.safeParse({ musicMix: { fadeInSec: 31 } }).success).toBe(false);
    expect(VideoPlanSchema.safeParse({ musicMix: { pan: 0.5 } }).success).toBe(false);
    expect(VideoPlanSchema.safeParse({ music: "lofi", musicMix: { volume: 0.5 } }).success).toBe(true);
  });
});
