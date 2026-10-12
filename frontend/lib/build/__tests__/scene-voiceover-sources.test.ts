import { describe, expect, it } from "vitest";
import type { VideoPlan } from "@shared/video-plan";
import { emptyCanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { recordedSceneAudio, sceneVoiceoverTexts, withUploadedVoice, withVoiceMix } from "../scene-voiceover";

const clip = { url: "https://cdn.hired.video/uploads/take-hook.webm", durationSeconds: 4.2 };

describe("voice sources", () => {
  const scenes: VideoPlan["scenes"] = {
    hook: { voiceover: "25 years running enterprise IT.", voiceClip: clip },
    who: { voiceover: "I hand back the savings." },
  };

  it("the AI voice speaks every scene with words when no takes are recorded", () => {
    expect(sceneVoiceoverTexts({ scenes })).toEqual({ hook: "25 years running enterprise IT.", who: "I hand back the savings." });
  });

  it("a recorded take replaces the AI voice for its scene; the rest keep it", () => {
    const plan: VideoPlan = { scenes, voice: { source: "recorded" } };
    expect(sceneVoiceoverTexts(plan)).toEqual({ who: "I hand back the savings." });
    expect(recordedSceneAudio(plan)).toEqual({ hook: { text: "25 years running enterprise IT.", ...clip } });
  });

  it("takes are ignored unless the voice is set to recorded", () => {
    expect(recordedSceneAudio({ scenes })).toEqual({});
  });

  it("one uploaded file carries the voice: no AI narration, one voice layer", () => {
    const plan: VideoPlan = { scenes, voice: { source: "upload", url: "https://cdn.hired.video/uploads/pitch.m4a", durationSeconds: 28 } };
    expect(sceneVoiceoverTexts(plan)).toEqual({});
    const canvas = withUploadedVoice(emptyCanvasState({ width: 1920, height: 1080, fps: 30 }), plan);
    const voice = canvas.audioLayers.filter((l) => l.kind === "voiceover");
    expect(voice).toHaveLength(1);
    expect(voice[0].durationSeconds).toBe(28);
    // Switching away removes it again.
    expect(withUploadedVoice(canvas, { scenes }).audioLayers.some((l) => l.kind === "voiceover")).toBe(false);
  });

  it("applies the voice level and ducking to the mix", () => {
    const base = emptyCanvasState({ width: 1920, height: 1080, fps: 30 });
    const mixed = withVoiceMix(base, { voiceMix: { voiceGain: 0.7, duck: true } });
    expect(mixed.audioMix?.voiceoverGain).toBe(0.7);
    expect(mixed.audioMix?.duckMusicUnderVoiceover).toBe(true);
    expect(withVoiceMix(base, {})).toBe(base);
  });
});
