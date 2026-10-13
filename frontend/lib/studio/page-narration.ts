/**
 * Page→video narration synthesis.
 *
 * The page→video scaffolder writes a spoken `narration` line per scene and
 * `pageVideoSpecToCanvas()` seeds a "pending synthesis" voiceover audio
 * layer per narrated scene (text set, source url empty). This module turns
 * those scripts
 * into actual audio CLIENT-SIDE — TTS engines (Kokoro/Piper/VibeVoice) run
 * in-browser via WebGPU, the same path the manual Voiceover panel uses
 * (DRY: `renderToPcm` → `pcmToWav` → `uploadSceneAudio`).
 *
 * Why client-side: the LLM gateway is text-only and the API has no TTS, but
 * the studio already ships in-browser engines. Running synthesis at commit
 * time means the generated draft opens in Studio with narration already on
 * the A2 voiceover track and scene timings stretched to fit — a narrated
 * video, not a silent one.
 *
 * Best-effort by design: if no exportable engine is available (no WebGPU),
 * the clips stay as pending placeholders and the editor's Voiceover panel
 * can synthesise them later. A per-clip failure is skipped, never fatal.
 */

import {
  TTS_ENGINES,
  isEngineAvailable,
  getEngineVoices,
  renderToPcm,
  pcmToWav,
  type TtsEngineId,
} from "@/lib/services/tts-engines";
import { studioService } from "@/lib/services/studio-service";
import type { TTSVoice } from "@/lib/services/studio-features-service";
import type { AudioLayer, CanvasState } from "@/lib/studio/editor-v2/canvas-state";

/** A pending-synthesis narration layer: a voiceover audio layer that
 *  carries a script (`text`) but whose source url is still empty. */
function isPendingNarration(layer: AudioLayer): boolean {
  return (
    layer.kind === "voiceover" &&
    !!layer.text &&
    layer.source.kind === "custom" &&
    layer.source.url === ""
  );
}

/** Engines that can render PCM (exportable), in preferred order. Kokoro is
 *  the best quality-for-size default; Piper is the lighter fallback. */
const PREFERRED_ENGINES: TtsEngineId[] = ["kokoro", "piper", "vibevoice"];

/** Tail padding (seconds) added to a scene so the visual doesn't cut the
 *  last word of its narration. */
const SCENE_TAIL_PADDING = 0.4;

function pickEngine(): TtsEngineId | null {
  for (const id of PREFERRED_ENGINES) {
    const desc = TTS_ENGINES.find((e) => e.id === id);
    if (desc?.exportable && isEngineAvailable(id)) return id;
  }
  return null;
}

export interface SynthesizeNarrationResult {
  canvas: CanvasState;
  /** How many pending clips were voiced. 0 when nothing was synthesised. */
  synthesised: number;
  /** Total pending clips found (synthesised + skipped/failed). */
  pending: number;
  /** Set when synthesis was skipped wholesale (e.g. no WebGPU engine). */
  skippedReason?: string;
}

/**
 * Synthesise every pending-narration voiceover layer in a CanvasState and
 * return an updated copy: layer source urls + durations filled, anchored
 * scenes stretched to fit their audio. The input is not mutated.
 */
export async function synthesizePendingNarration(
  canvas: CanvasState,
  opts: {
    onProgress?: (done: number, total: number) => void;
    speed?: number;
    /** A voice from `listNarrationVoices()`; unknown / absent → the engine's first. */
    voiceId?: string;
  } = {},
): Promise<SynthesizeNarrationResult> {
  const pendingClips = canvas.audioLayers.filter(isPendingNarration);
  if (pendingClips.length === 0) {
    return { canvas, synthesised: 0, pending: 0 };
  }

  const engine = pickEngine();
  if (!engine) {
    return {
      canvas,
      synthesised: 0,
      pending: pendingClips.length,
      skippedReason: "No in-browser TTS engine available (WebGPU required).",
    };
  }

  const voices: TTSVoice[] = await getEngineVoices(engine).catch(() => []);
  // Engine voices carry `voice_id` (an untyped `[]` fallback hid a `.id`
  // read here, so no voice was ever found and narration always skipped).
  const voiceId = voices.find((v) => v.voice_id === opts.voiceId)?.voice_id ?? voices[0]?.voice_id;
  if (!voiceId) {
    return {
      canvas,
      synthesised: 0,
      pending: pendingClips.length,
      skippedReason: `No voice available for ${engine}.`,
    };
  }

  // Mutable working copies — clone so callers' input stays untouched.
  const audioLayers = canvas.audioLayers.map((l) => ({ ...l }));
  const scenes = canvas.scenes.map((s) => ({ ...s }));
  const sceneById = new Map(scenes.map((s) => [s.id, s] as const));

  let done = 0;
  let synthesised = 0;
  for (const clip of audioLayers) {
    if (!isPendingNarration(clip) || !clip.text) continue;
    try {
      const { pcm, sampleRate } = await renderToPcm(engine, clip.text, voiceId, opts.speed ?? 1);
      const wav = pcmToWav(pcm, sampleRate);
      const file = new File([wav], `narration-${clip.id}.wav`, { type: "audio/wav" });
      const { data } = await studioService.uploadSceneAudio(file);
      const durationSeconds = pcm.length / sampleRate;
      clip.source = { kind: "custom", url: data.url };
      clip.durationSeconds = durationSeconds;
      // Stretch the anchored scene so the visual covers the whole line.
      if (clip.anchorSceneId) {
        const scene = sceneById.get(clip.anchorSceneId);
        if (scene) {
          scene.durationSeconds = Math.max(
            scene.durationSeconds,
            durationSeconds + SCENE_TAIL_PADDING,
          );
        }
      }
      synthesised += 1;
    } catch {
      // Leave this clip as a pending placeholder; the editor can retry.
    } finally {
      done += 1;
      opts.onProgress?.(done, pendingClips.length);
    }
  }

  return {
    canvas: { ...canvas, audioLayers, scenes },
    synthesised,
    pending: pendingClips.length,
  };
}

/** A short line in one narration voice, as audio to play right away —
 *  nothing uploaded (the voice picker's ▶). Throws when no engine runs. */
export async function renderNarrationSample(voiceId: string, text: string): Promise<Blob> {
  const engine = pickEngine();
  if (!engine) throw new Error("No in-browser TTS engine available (WebGPU required).");
  const { pcm, sampleRate } = await renderToPcm(engine, text, voiceId);
  return pcmToWav(pcm, sampleRate);
}

/** The voices narration can speak in, on this device (empty when no
 *  in-browser engine is available). */
export async function listNarrationVoices(): Promise<TTSVoice[]> {
  const engine = pickEngine();
  if (!engine) return [];
  return getEngineVoices(engine).catch((): TTSVoice[] => []);
}
