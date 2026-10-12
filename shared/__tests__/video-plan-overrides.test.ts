/**
 * Scene look overrides + export settings on the video plan (#2351d): plans
 * saved before the fields existed still parse, each override validates at
 * its bounds and rejects what the résumé row can't hold, and the AI rewrite
 * can never change the owner's look, director's notes or export settings.
 *
 * Run: node --import tsx --test shared/__tests__/video-plan-overrides.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  pinOwnerOverrides,
  readVideoPlan,
  SCENE_NOTES_MAX,
  sceneOverrides,
  ScenePlanSchema,
  VideoPlanSchema,
  type VideoPlan,
} from "../video-plan.js";

/** A plan as stored in production before the overrides existed. */
const LEGACY_PLAN = {
  scenes: {
    hook: { duration: 6, look: "midnight", voiceover: "Twenty-five years running enterprise IT." },
    proof: { roles: ["c0ffee00-0000-4000-8000-000000000042", "work-1"], title: "Chief Innovation Officer", lines: ["BuilderForce.ai"] },
    next: { off: true },
  },
  music: "corporate-inspire",
  musicMix: { volume: 0.4, fadeOutSec: 2 },
  canvas: { widgets: { "build-hook-heading": { text: "25 years in IT" } } },
  targeting: { audience: "hiringManager" },
  aspect: "9:16",
  voice: { source: "ai", voiceId: "ava" },
};

const FILTERS = { brightness: 1.2, contrast: 1, saturation: 0.8, hue: -20, blur: 0, warmth: 0.3 };

const FULL_OVERRIDES = {
  background: "gradient:#7c3aed:#2563eb",
  filters: FILTERS,
  effects: [{ kind: "vignette", params: { intensity: 0.4 } }],
  transitionIn: "slide",
  notes: "Lead with the 30-engineer team. Keep it warm.",
  palette: { accent: "#FDE047" },
  font: "playfair",
  motion: "cinematic",
};

describe("video plan scene overrides", () => {
  it("parses a plan saved before the overrides existed, unchanged", () => {
    const parsed = VideoPlanSchema.safeParse(LEGACY_PLAN);
    assert.equal(parsed.success, true);
    assert.deepEqual(readVideoPlan({ meta: { video: LEGACY_PLAN } }), LEGACY_PLAN);
    assert.deepEqual(sceneOverrides(parsed.success ? parsed.data.scenes?.hook : undefined), {});
  });

  it("accepts every override on a scene and export settings on the video", () => {
    const plan = { scenes: { who: { duration: 5, ...FULL_OVERRIDES } }, export: { resolution: "4k", fps: 60, codec: "vp9" } };
    const parsed = VideoPlanSchema.safeParse(plan);
    assert.equal(parsed.success, true);
    assert.deepEqual(parsed.success && parsed.data, plan);
  });

  it("accepts the bounds", () => {
    const low = { brightness: 0, contrast: 0, saturation: 0, hue: -180, blur: 0, warmth: -1 };
    const high = { brightness: 2, contrast: 2, saturation: 2, hue: 180, blur: 10, warmth: 1 };
    assert.equal(ScenePlanSchema.safeParse({ filters: low }).success, true);
    assert.equal(ScenePlanSchema.safeParse({ filters: high }).success, true);
    assert.equal(ScenePlanSchema.safeParse({ notes: "x".repeat(SCENE_NOTES_MAX) }).success, true);
    assert.equal(ScenePlanSchema.safeParse({ background: "solid:#0f172a" }).success, true);
    assert.equal(ScenePlanSchema.safeParse({ background: "particles:#7c3aed" }).success, true);
  });

  it("rejects overrides the renderer can't use", () => {
    const bad: Array<[string, unknown]> = [
      ["background without a colour", { background: "gradient" }],
      ["background with a CSS url", { background: "url(https://x.test/a.png)" }],
      ["short hex background", { background: "solid:#fff" }],
      ["filters out of range", { filters: { ...FILTERS, blur: 11 } }],
      ["filters missing a slider", { filters: { brightness: 1 } }],
      ["unknown transition", { transitionIn: "wipe" }],
      ["notes over the limit", { notes: "x".repeat(SCENE_NOTES_MAX + 1) }],
      ["palette colour not hex", { palette: { from: "red" } }],
      ["palette unknown key", { palette: { surface: "#000000" } }],
      ["font with a CSS stack", { font: "'Inter', sans-serif" }],
      ["unknown motion", { motion: "wild" }],
      ["too many effects", { effects: Array.from({ length: 13 }, () => ({ kind: "blur", params: {} })) }],
      ["an effect over the size budget", { effects: [{ kind: "lut", params: { data: "x".repeat(5000) } }] }],
    ];
    for (const [why, scene] of bad) assert.equal(ScenePlanSchema.safeParse(scene).success, false, why);
  });

  it("rejects export settings outside the studio's options", () => {
    for (const exp of [{ resolution: "8k" }, { fps: 25 }, { codec: "av1" }, { codec: "ProRes" }, { codec: "dnxhr" }, { resolution: "1080p", extra: true }]) {
      assert.equal(VideoPlanSchema.safeParse({ export: exp }).success, false, JSON.stringify(exp));
    }
  });

  it("accepts the ffmpeg.wasm download codecs (ProRes / DNxHD)", () => {
    for (const codec of ["prores", "dnxhd"] as const) {
      const parsed = VideoPlanSchema.parse({ export: { resolution: "4k", fps: 24, codec } });
      assert.equal(parsed.export?.codec, codec);
    }
  });

  it("picks only the override fields out of a scene", () => {
    assert.deepEqual(sceneOverrides({ duration: 5, look: "ocean", ...FULL_OVERRIDES } as never), FULL_OVERRIDES);
  });
});

describe("pinOwnerOverrides", () => {
  const original: VideoPlan = VideoPlanSchema.parse({
    scenes: { who: { duration: 6, ...FULL_OVERRIDES }, skills: { notes: "Only the AI skills." } },
    export: { fps: 24 },
  });

  it("puts back notes and look the model changed or dropped, keeping its wording", () => {
    const model: VideoPlan = VideoPlanSchema.parse({
      scenes: { who: { duration: 4, title: "Sean Hogg", notes: "rewritten", background: "solid:#000000" } },
      export: { resolution: "4k" },
    });
    const pinned = pinOwnerOverrides(model, original);
    assert.deepEqual(pinned.scenes?.who, { duration: 4, title: "Sean Hogg", ...FULL_OVERRIDES });
    assert.deepEqual(pinned.scenes?.skills, { notes: "Only the AI skills." });
    assert.deepEqual(pinned.export, { fps: 24 });
    assert.equal(VideoPlanSchema.safeParse(pinned).success, true);
  });

  it("removes overrides the model invented", () => {
    const pinned = pinOwnerOverrides(
      VideoPlanSchema.parse({ scenes: { hook: { font: "roboto", duration: 5 } }, export: { codec: "h265" } }),
      VideoPlanSchema.parse({}),
    );
    assert.deepEqual(pinned, { scenes: { hook: { duration: 5 } } });
  });
});
