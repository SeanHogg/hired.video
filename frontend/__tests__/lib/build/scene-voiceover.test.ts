/**
 * Unit tests for laying per-scene voiceover clips onto the kit canvas:
 * which scenes are narrated, where each clip starts, scene stretching, and
 * that the input canvas is never mutated.
 */
import { describe, it, expect } from "vitest";
import type { VideoPlan } from "@shared/video-plan";
import { layerCompositionStart, type CanvasState, type Scene } from "@/lib/studio/editor-v2/canvas-state";
import {
  sceneVoiceoverTexts,
  voiceoverLayerId,
  withSceneVoiceovers,
  type SceneAudio,
} from "@/lib/build/scene-voiceover";

const scene = (id: string, durationSeconds: number): Scene =>
  ({ id: `build-${id}`, label: id, durationSeconds, backgroundColor: "#000", widgets: [] }) as unknown as Scene;

function makeCanvas(): CanvasState {
  return {
    scenes: [scene("hook", 4), scene("who", 5), scene("proof", 6)],
    audioLayers: [],
  } as unknown as CanvasState;
}

const clip = (text: string, durationSeconds = 2): SceneAudio => ({ text, url: `https://cdn.test/${text}.wav`, durationSeconds });

describe("sceneVoiceoverTexts", () => {
  it("keeps trimmed text of scenes that are on", () => {
    const plan = {
      scenes: { hook: { voiceover: "  Hi there " }, who: { voiceover: "   " }, skills: { off: true, voiceover: "Skip me" } },
    } as VideoPlan;
    expect(sceneVoiceoverTexts(plan)).toEqual({ hook: "Hi there" });
  });

  it("is empty for the default plan", () => {
    expect(sceneVoiceoverTexts({})).toEqual({});
  });
});

describe("withSceneVoiceovers", () => {
  it("starts each clip where its scene starts", () => {
    const out = withSceneVoiceovers(makeCanvas(), { who: clip("who"), proof: clip("proof") });
    const who = out.audioLayers.find((l) => l.id === voiceoverLayerId("who"));
    const proof = out.audioLayers.find((l) => l.id === voiceoverLayerId("proof"));
    expect(who && layerCompositionStart(out, who)).toBe(4);
    expect(proof && layerCompositionStart(out, proof)).toBe(9);
    expect(who?.kind).toBe("voiceover");
    expect(who?.source).toEqual({ kind: "custom", url: "https://cdn.test/who.wav" });
  });

  it("lengthens a scene to cover a longer narration", () => {
    const out = withSceneVoiceovers(makeCanvas(), { hook: clip("long", 7) });
    expect(out.scenes[0].durationSeconds).toBeCloseTo(7.4);
    expect(out.scenes[1].durationSeconds).toBe(5);
    const proof = withSceneVoiceovers(makeCanvas(), { hook: clip("long", 7), proof: clip("p") });
    const layer = proof.audioLayers.find((l) => l.id === voiceoverLayerId("proof"));
    expect(layer && layerCompositionStart(proof, layer)).toBeCloseTo(12.4);
  });

  it("does not mutate the input canvas", () => {
    const input = makeCanvas();
    const snapshot = JSON.parse(JSON.stringify(input));
    withSceneVoiceovers(input, { hook: clip("long", 9) });
    expect(input).toEqual(snapshot);
  });

  it("ignores scenes absent from the canvas (switched off) and clips without audio", () => {
    const out = withSceneVoiceovers(makeCanvas(), { skills: clip("skills"), next: { text: "x", url: "", durationSeconds: 1 } });
    expect(out.audioLayers).toEqual([]);
  });

  it("replaces its own layers on re-lay and keeps other audio", () => {
    const music = { id: "music-1", kind: "music" } as CanvasState["audioLayers"][number];
    const base = { ...makeCanvas(), audioLayers: [music] };
    const once = withSceneVoiceovers(base, { hook: clip("a") });
    const twice = withSceneVoiceovers(once, { hook: clip("b") });
    expect(twice.audioLayers.map((l) => l.id)).toEqual(["music-1", voiceoverLayerId("hook")]);
    expect(twice.audioLayers[1].text).toBe("b");
    expect(withSceneVoiceovers(twice, {}).audioLayers.map((l) => l.id)).toEqual(["music-1"]);
  });

  it("returns the same canvas when there is nothing to lay", () => {
    const input = makeCanvas();
    expect(withSceneVoiceovers(input, {})).toBe(input);
  });
});
