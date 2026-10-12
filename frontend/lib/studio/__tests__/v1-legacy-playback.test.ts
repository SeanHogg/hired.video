/**
 * Old saved V1 projects still play after the V1 cull (#693, #721).
 *
 * Fixtures are real V1 VideoScript shapes:
 *   - `data/templates/video-resume-professional.json` — a shipped V1 template
 *     (legacy single-track era; no audio block).
 *   - `fixtures/v1-stored-script.json` — that template as a stored
 *     `studio_projects.storyboard` row after V1 editing: multi-clip music
 *     (stock + uploaded URL), lane mix, per-scene TTS voiceover map, scene
 *     audio, an audio scene element, and the save-draft `_` meta keys.
 *
 * Run: vitest run lib/studio/__tests__/v1-legacy-playback.test.ts
 */
import { describe, it, expect } from "vitest";
import professionalTemplate from "@/data/templates/video-resume-professional.json";
import storedScriptJson from "./fixtures/v1-stored-script.json";
import { scriptAudioToCanvas } from "@/lib/studio/editor-v2/script-audio-to-layers";
import { scriptToCanvasState } from "@/lib/studio/editor-v2/script-to-canvas";
import {
  canvasStateToTimeline,
  timelineToCanvasState,
} from "@/lib/studio/editor-v2/timeline-emit";
import { isStoredVideoScript, resolvePublicCanvasState } from "@/lib/studio/public-canvas-state";
import type { VideoScript } from "@/types/video-script";

const stored = storedScriptJson as unknown as VideoScript;
const template = professionalTemplate as unknown as VideoScript;

/** What the public payload carries: the stored row minus save-draft meta
 *  (mirrors api/src/services/studio/public-video-state.ts). */
function publicLegacyScript(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith("_")));
}

describe("scriptAudioToCanvas (#693)", () => {
  it("maps every V1 music clip to a music layer, keeping start, trim, fades and clip volume", () => {
    const { audioLayers } = scriptAudioToCanvas(stored);
    const music = audioLayers.filter((l) => l.kind === "music");
    expect(music).toHaveLength(2);

    const [stock, uploaded] = music;
    expect(stock!.source).toEqual({ kind: "stock", trackId: "corporate-inspire" });
    expect(stock!.startOffsetSec).toBe(0);
    expect(stock!.durationSeconds).toBe(14);
    expect(stock!.gain).toBeCloseTo(0.9);
    // No clip fades → the V1 music-lane fades seed the layer.
    expect(stock!.fadeInSec).toBe(1.5);
    expect(stock!.fadeOutSec).toBe(2);

    expect(uploaded!.source).toEqual({
      kind: "custom",
      url: "https://cdn.hired.video/studio/audio/7d1c0a3e-original-music.mp3",
    });
    expect(uploaded!.startOffsetSec).toBe(14);
    expect(uploaded!.trimStartSec).toBe(3);
    expect(uploaded!.durationSeconds).toBe(17); // 3s trimmed + 14s played
    expect(uploaded!.fadeInSec).toBe(0.5); // the clip's own fade wins
    expect(uploaded!.gain).toBeCloseTo(0.7);
  });

  it("maps per-scene TTS voiceover, scene audio and audio elements to anchored voiceover layers, de-duplicated by URL", () => {
    const vo = scriptAudioToCanvas(stored).audioLayers.filter((l) => l.kind === "voiceover");
    expect(vo.map((l) => [l.anchorSceneId, l.source])).toEqual([
      ["intro", { kind: "custom", url: "https://cdn.hired.video/studio/voiceover/intro-kokoro.wav" }],
      ["achievement", { kind: "custom", url: "https://cdn.hired.video/studio/voiceover/achievement-kokoro.wav" }],
      ["skills", { kind: "custom", url: "https://cdn.hired.video/studio/recordings/skills-take2.webm" }],
    ]);
    expect(vo[0]!.durationSeconds).toBeCloseTo(5.4);
  });

  it("maps the V1 lane mix onto the V2 mix, clamping 0..2 gains into 0..1", () => {
    const { audioMix } = scriptAudioToCanvas(stored);
    expect(audioMix).not.toBeNull();
    expect(audioMix!.masterGain).toBe(1); // 1.2 clamped
    expect(audioMix!.musicGain).toBeCloseTo(0.7); // volume 0.5 × lane 1.4
    expect(audioMix!.musicMuted).toBe(false);
    expect(audioMix!.voiceoverGain).toBeCloseTo(0.8);
    expect(audioMix!.voiceoverMuted).toBe(true);
  });

  it("hoists the legacy single-track shape into one full-length music layer at unity gain", () => {
    const script: VideoScript = {
      ...template,
      video: { ...template.video, audio: { track: "corporate-inspire", label: "Corporate Inspire", volume: 0.4 } },
    };
    const { audioLayers, audioMix } = scriptAudioToCanvas(script);
    expect(audioLayers).toHaveLength(1);
    expect(audioLayers[0]).toMatchObject({
      kind: "music",
      source: { kind: "stock", trackId: "corporate-inspire" },
      startOffsetSec: 0,
      durationSeconds: 28,
      gain: 1,
    });
    expect(audioMix!.musicGain).toBeCloseTo(0.4);
  });

  it("returns no layers and a null mix for a script with no audio (boundary)", () => {
    expect(scriptAudioToCanvas(template)).toEqual({ audioLayers: [], audioMix: null });
    const silent: VideoScript = {
      ...template,
      video: { ...template.video, audio: { track: "none", label: "None", volume: 0.6 } },
    };
    expect(scriptAudioToCanvas(silent).audioLayers).toEqual([]);
  });
});

describe("V1 audio lanes live on Timeline JSON (#693)", () => {
  it("survives CanvasState → Timeline → CanvasState with layers and mix intact", () => {
    const state = scriptToCanvasState(stored);
    const back = timelineToCanvasState(canvasStateToTimeline(state));
    expect(back.audioLayers.map((l) => [l.kind, l.source, l.anchorSceneId])).toEqual(
      state.audioLayers.map((l) => [l.kind, l.source, l.anchorSceneId]),
    );
    expect(back.audioMix).toEqual(state.audioMix);
  });
});

describe("resolvePublicCanvasState (#721)", () => {
  it("plays a stored V1 project (no timeline) from its legacy script", () => {
    const state = resolvePublicCanvasState({
      timelineSpec: null,
      legacyScript: publicLegacyScript(storedScriptJson as Record<string, unknown>),
    });
    expect(state).not.toBeNull();
    expect(state!.scenes).toHaveLength(4);
    expect(state!.scenes.every((s) => s.widgets.length > 0)).toBe(true);
    expect(state!.width).toBe(1920);
    expect(state!.height).toBe(1080);
    expect(state!.audioLayers.length).toBe(5);
  });

  it("plays the shipped V1 template shape with no audio block", () => {
    const state = resolvePublicCanvasState({ legacyScript: professionalTemplate });
    expect(state?.scenes).toHaveLength(4);
  });

  it("prefers the V2 timeline when it has content", () => {
    const v2 = scriptToCanvasState(template);
    const timelineSpec = canvasStateToTimeline({ ...v2, scenes: v2.scenes.slice(0, 2) });
    const state = resolvePublicCanvasState({ timelineSpec, legacyScript: stored });
    expect(state?.scenes).toHaveLength(2);
  });

  it("falls back to the legacy script when the timeline carries no widgets", () => {
    const emptyTimeline = canvasStateToTimeline({
      ...scriptToCanvasState(template),
      scenes: scriptToCanvasState(template).scenes.map((s) => ({ ...s, widgets: [] })),
    });
    const state = resolvePublicCanvasState({ timelineSpec: emptyTimeline, legacyScript: template });
    expect(state?.scenes.some((s) => s.widgets.length > 0)).toBe(true);
  });

  it("returns null for payloads with nothing playable (error cases)", () => {
    expect(resolvePublicCanvasState({})).toBeNull();
    expect(resolvePublicCanvasState({ timelineSpec: "garbage", legacyScript: null })).toBeNull();
    expect(resolvePublicCanvasState({ legacyScript: { video: {}, scenes: [] } })).toBeNull();
    expect(resolvePublicCanvasState({ legacyScript: { video: {}, scenes: [{ title: "no id" }] } })).toBeNull();
  });

  it("isStoredVideoScript rejects V2 meta-only storyboards", () => {
    expect(isStoredVideoScript({ _name: "V2 video", _rev: 3 })).toBe(false);
    expect(isStoredVideoScript(stored)).toBe(true);
  });
});
