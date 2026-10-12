/**
 * Captions from the voiceover: chunking, timing (clip length vs scene
 * length), edits keyed by chunk text, laying the captions on the canvas,
 * the plan helpers' pruning, and the schema's bounds.
 */
import { describe, it, expect } from "vitest";
import { CAPTION_TEXT_MAX, VideoPlanSchema, type VideoPlan } from "@shared/video-plan";
import type { CanvasState, Scene } from "@/lib/studio/editor-v2/canvas-state";
import { withSceneVoiceovers } from "@/lib/build/scene-voiceover";
import {
  CAPTION_MAX_CHARS,
  CAPTION_MAX_WORDS,
  captionWidgetId,
  chunkCaptionText,
  sceneCaptions,
  setCaptionEdit,
  setCaptionStyle,
  setCaptionsOn,
  timeCaptionChunks,
  withCaptions,
} from "@/lib/build/captions";

// A real voiceover, the length the kit VoiceoverField produces.
const HOOK_VO =
  "I cut annual operating costs by $1.79M, almost half, in eighteen months. Then I handed the savings back to the teams that earned them.";

const scene = (id: string, durationSeconds: number): Scene =>
  ({ id: `build-${id}`, label: id, durationSeconds, backgroundColor: "#000", widgets: [] }) as unknown as Scene;

function makeCanvas(): CanvasState {
  return {
    width: 1920,
    height: 1080,
    scenes: [scene("hook", 6), scene("who", 5), scene("proof", 8)],
    audioLayers: [],
    captions: null,
  } as unknown as CanvasState;
}

describe("chunkCaptionText", () => {
  it("breaks at sentence ends and keeps every chunk inside the limits", () => {
    const chunks = chunkCaptionText(HOOK_VO);
    expect(chunks.join(" ")).toBe(HOOK_VO);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(CAPTION_MAX_CHARS);
      expect(c.split(" ").length).toBeLessThanOrEqual(CAPTION_MAX_WORDS);
    }
    expect(chunks.some((c) => c.endsWith("months."))).toBe(true);
  });

  it("collapses whitespace and returns nothing for blank text", () => {
    expect(chunkCaptionText("  Hello \n  world  ")).toEqual(["Hello world"]);
    expect(chunkCaptionText("   ")).toEqual([]);
  });

  it("keeps an over-long single word whole, capped at the stored max", () => {
    const word = "x".repeat(CAPTION_TEXT_MAX + 30);
    const chunks = chunkCaptionText(`Hi ${word} there`);
    expect(chunks).toContain("x".repeat(CAPTION_TEXT_MAX));
    expect(chunks.every((c) => c.length <= CAPTION_TEXT_MAX)).toBe(true);
  });
});

describe("timeCaptionChunks", () => {
  it("fills the span back to back from the lead", () => {
    const times = timeCaptionChunks(["one two", "three four five six"], 4, 0.5);
    expect(times[0].start).toBe(0.5);
    expect(times[0].end).toBe(times[1].start);
    expect(times[1].end).toBeCloseTo(4.5, 2);
    // The longer chunk gets more time.
    expect(times[1].end - times[1].start).toBeGreaterThan(times[0].end - times[0].start);
  });

  it("gives empty input or a zero span nothing to show", () => {
    expect(timeCaptionChunks([], 3)).toEqual([]);
    expect(timeCaptionChunks(["hi"], 0)).toEqual([{ start: 0, end: 0 }]);
  });
});

describe("sceneCaptions", () => {
  it("times a narrated scene across its clip, others across the scene", () => {
    const plan: VideoPlan = { scenes: { hook: { voiceover: HOOK_VO }, who: { voiceover: "Hello, I'm Sean." } } };
    const canvas = withSceneVoiceovers(makeCanvas(), { hook: { text: HOOK_VO, url: "https://cdn.test/a.wav", durationSeconds: 4 } });
    const out = sceneCaptions(plan, canvas);
    const hook = out.hook ?? [];
    expect(hook.at(-1)?.end).toBeCloseTo(4, 1);
    // No clip for Who: the scene's length minus the tail.
    expect(out.who?.at(-1)?.end).toBeCloseTo(4.6, 1);
    expect(out.proof).toBeUndefined();
  });

  it("skips scenes that are off and an uploaded voice", () => {
    expect(sceneCaptions({ scenes: { hook: { voiceover: "Hi.", off: true } } }, makeCanvas())).toEqual({});
    const upload: VideoPlan = {
      scenes: { hook: { voiceover: "Hi." } },
      voice: { source: "upload", url: "https://cdn.test/v.mp3", durationSeconds: 10 },
    };
    expect(sceneCaptions(upload, makeCanvas())).toEqual({});
  });

  it("applies an edit to the chunk with that derived text", () => {
    const base: VideoPlan = { scenes: { hook: { voiceover: HOOK_VO } } };
    const first = sceneCaptions(base, makeCanvas()).hook?.[0];
    expect(first).toBeDefined();
    const plan = setCaptionEdit(base, "hook", first!.from, "I cut costs by $1.79M");
    const edited = sceneCaptions(plan, makeCanvas()).hook?.[0];
    expect(edited?.text).toBe("I cut costs by $1.79M");
    expect(edited?.edited).toBe(true);
    expect(edited?.from).toBe(first!.from);
  });
});

describe("withCaptions", () => {
  const plan: VideoPlan = { scenes: { hook: { voiceover: HOOK_VO } }, captions: { on: true, size: "l", position: "top" } };

  it("is the same canvas while captions are off", () => {
    const canvas = makeCanvas();
    expect(withCaptions(canvas, { scenes: { hook: { voiceover: HOOK_VO } } })).toBe(canvas);
  });

  it("adds a timed text widget per chunk and mirrors the cues", () => {
    const canvas = makeCanvas();
    const out = withCaptions(canvas, plan);
    const hook = out.scenes[0].widgets;
    const chunks = sceneCaptions(plan, canvas).hook ?? [];
    expect(hook).toHaveLength(chunks.length);
    expect(hook[0].id).toBe(captionWidgetId("hook", 0));
    expect(hook[0].visibleFrom).toBe(chunks[0].start);
    expect(hook[0].visibleTo).toBe(chunks[0].end);
    expect(hook[0].position.y).toBeLessThan(0.2);
    expect(out.captions?.enabled).toBe(true);
    expect(out.captions?.cues).toHaveLength(chunks.length);
    // The input canvas is untouched.
    expect(canvas.scenes[0].widgets).toHaveLength(0);
  });

  it("places cues at video time (after earlier scenes)", () => {
    const p: VideoPlan = { scenes: { who: { voiceover: "Hello, I'm Sean." } }, captions: { on: true } };
    const out = withCaptions(makeCanvas(), p);
    expect(out.captions?.cues[0].start).toBe(6);
  });
});

describe("plan helpers", () => {
  it("store nothing for defaults and prune as they go", () => {
    expect(setCaptionsOn({}, false)).toEqual({});
    expect(setCaptionsOn({}, true)).toEqual({ captions: { on: true } });
    expect(setCaptionStyle({ captions: { on: true } }, { position: "bottom", size: "m" })).toEqual({ captions: { on: true } });
    const edited = setCaptionEdit({}, "hook", "Hello world", "Hi world");
    expect(edited).toEqual({ captions: { edits: { hook: [{ from: "Hello world", text: "Hi world" }] } } });
    // Typing it back to the derived words drops the edit (and the key).
    expect(setCaptionEdit(edited, "hook", "Hello world", " Hello  world ")).toEqual({});
  });

  it("produce plans the schema accepts", () => {
    const plan = setCaptionEdit(setCaptionStyle(setCaptionsOn({}, true), { size: "s", position: "middle" }), "who", "a", "b");
    expect(VideoPlanSchema.safeParse(plan).success).toBe(true);
  });
});

describe("CaptionsPlanSchema (via VideoPlanSchema)", () => {
  it("accepts a plan without captions (backward compatible)", () => {
    expect(VideoPlanSchema.safeParse({ scenes: { hook: { voiceover: "Hi" } } }).success).toBe(true);
  });

  it("accepts text at the max and rejects one past it", () => {
    const at = { captions: { edits: { hook: [{ from: "a", text: "y".repeat(CAPTION_TEXT_MAX) }] } } };
    const over = { captions: { edits: { hook: [{ from: "a", text: "y".repeat(CAPTION_TEXT_MAX + 1) }] } } };
    expect(VideoPlanSchema.safeParse(at).success).toBe(true);
    expect(VideoPlanSchema.safeParse(over).success).toBe(false);
  });

  it("rejects an unknown position or key", () => {
    expect(VideoPlanSchema.safeParse({ captions: { position: "left" } }).success).toBe(false);
    expect(VideoPlanSchema.safeParse({ captions: { on: true, color: "red" } }).success).toBe(false);
  });
});
