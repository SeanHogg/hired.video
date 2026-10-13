/**
 * Per-scene voiceover — the pure half of the kit workspace narration.
 *
 * The owner writes what to say over each scene (`plan.scenes[id].voiceover`);
 * useSceneVoiceovers turns that text into hosted audio. This module only
 * decides WHICH scenes are narrated and lays the finished audio onto the
 * derived canvas: one voiceover layer per scene, anchored to that scene so it
 * starts where the scene starts (`layerCompositionStart` — the same rule the
 * timeline, the preview scheduler and the export use). A scene is lengthened
 * to cover its narration, the way page→video narration does, so the visual
 * never cuts the last word.
 */
import { VIDEO_SCENE_IDS, type VideoPlan, type VideoSceneId } from "@shared/video-plan";
import { DEFAULT_AUDIO_MIX, makeAudioLayer, type AudioLayer, type CanvasState } from "@/lib/studio/editor-v2/canvas-state";

/** Synthesised narration for one scene, hosted where the post path can play it. */
export interface SceneAudio {
  /** The text it was generated from — a stale clip is never laid down. */
  text: string;
  url: string;
  durationSeconds: number;
}

/** Seconds a narrated scene holds after its last word. */
const TAIL_PADDING = 0.4;

/** Canvas scene id for a plan scene (see video-composition). */
export const canvasSceneId = (sceneId: VideoSceneId): string => `build-${sceneId}`;

/** Stable layer id, so re-laying a clip replaces it rather than adding one. */
export const voiceoverLayerId = (sceneId: VideoSceneId): string => `build-${sceneId}-voiceover`;

/** The narration text per scene the AI voice speaks: scenes in the video
 *  with words to say — minus scenes the owner recorded themselves, and none
 *  at all when one uploaded file carries the voice. */
export function sceneVoiceoverTexts(plan: VideoPlan): Partial<Record<VideoSceneId, string>> {
  const out: Partial<Record<VideoSceneId, string>> = {};
  if (plan.voice?.source === "upload" || plan.voice?.source === "none") return out;
  const recorded = plan.voice?.source === "recorded";
  for (const id of VIDEO_SCENE_IDS) {
    const scene = plan.scenes?.[id];
    const text = scene?.voiceover?.trim();
    if (recorded && scene?.voiceClip) continue;
    if (text && !scene?.off) out[id] = text;
  }
  return out;
}

/** The owner's own takes, per scene (Voice › Record my own). */
export function recordedSceneAudio(plan: VideoPlan): Partial<Record<VideoSceneId, SceneAudio>> {
  const out: Partial<Record<VideoSceneId, SceneAudio>> = {};
  if (plan.voice?.source !== "recorded") return out;
  for (const id of VIDEO_SCENE_IDS) {
    const clip = plan.scenes?.[id]?.voiceClip;
    if (clip && !plan.scenes?.[id]?.off) out[id] = { text: plan.scenes?.[id]?.voiceover ?? "", url: clip.url, durationSeconds: clip.durationSeconds };
  }
  return out;
}

const UPLOAD_LAYER_ID = "build-voice-upload";

/** One uploaded voice file over the whole video (Voice › Upload). */
export function withUploadedVoice(canvas: CanvasState, plan: VideoPlan): CanvasState {
  const voice = plan.voice;
  const rest = canvas.audioLayers.filter((l) => l.id !== UPLOAD_LAYER_ID);
  if (voice?.source !== "upload") return rest.length === canvas.audioLayers.length ? canvas : { ...canvas, audioLayers: rest };
  const layer = makeAudioLayer({
    id: UPLOAD_LAYER_ID,
    kind: "voiceover",
    source: { kind: "custom", url: voice.url },
    label: "Voiceover",
    durationSeconds: voice.durationSeconds,
  });
  return { ...canvas, audioLayers: [...rest, layer] };
}

/** The owner's voice level and "lower the music while someone speaks". */
export function withVoiceMix(canvas: CanvasState, plan: VideoPlan): CanvasState {
  const mix = plan.voiceMix;
  if (!mix) return canvas;
  return {
    ...canvas,
    audioMix: {
      ...DEFAULT_AUDIO_MIX,
      ...(canvas.audioMix ?? {}),
      ...(mix.voiceGain !== undefined ? { voiceoverGain: mix.voiceGain } : {}),
      ...(mix.duck !== undefined ? { duckMusicUnderVoiceover: mix.duck } : {}),
    },
  };
}

/**
 * `canvas` with a voiceover layer per narrated scene. Clips for scenes the
 * canvas doesn't have (switched off) are ignored. The input is not mutated.
 */
export function withSceneVoiceovers(
  canvas: CanvasState,
  audioByScene: Partial<Record<VideoSceneId, SceneAudio>>,
): CanvasState {
  const ours = new Set(VIDEO_SCENE_IDS.map(voiceoverLayerId));
  const layers: AudioLayer[] = [];
  const stretch = new Map<string, number>();
  for (const id of VIDEO_SCENE_IDS) {
    const audio = audioByScene[id];
    const sceneKey = canvasSceneId(id);
    if (!audio?.url || !canvas.scenes.some((s) => s.id === sceneKey)) continue;
    layers.push(
      makeAudioLayer({
        id: voiceoverLayerId(id),
        kind: "voiceover",
        source: { kind: "custom", url: audio.url },
        label: "Voiceover",
        durationSeconds: audio.durationSeconds,
        anchorSceneId: sceneKey,
        text: audio.text,
      }),
    );
    stretch.set(sceneKey, audio.durationSeconds + TAIL_PADDING);
  }
  if (layers.length === 0 && !canvas.audioLayers.some((l) => ours.has(l.id))) return canvas;

  return {
    ...canvas,
    scenes: canvas.scenes.map((s) => {
      const needed = stretch.get(s.id);
      return needed && needed > s.durationSeconds ? { ...s, durationSeconds: needed } : s;
    }),
    audioLayers: [...canvas.audioLayers.filter((l) => !ours.has(l.id)), ...layers],
  };
}
