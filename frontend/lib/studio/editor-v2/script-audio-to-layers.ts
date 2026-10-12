/**
 * Read-time adapter for a stored V1 script's audio (#693). The V1 editor kept
 * music and voiceover on `script.video.*`; V2 keeps them as `audioLayers[]` +
 * `audioMix` on CanvasState, which `canvasStateToTimeline` emits onto the
 * Timeline JSON (music/sfx on lane a1, voiceover on a2, the mix alongside).
 * This module is the single mapping from every V1 audio field to that model,
 * so an old project opened in the editor or played on /v/:id keeps its sound:
 *
 *   video.audio.clips[]           → one music layer per clip (stock id or URL),
 *                                   keeping start, trim, fades and clip volume
 *   video.audio.track (no clips)  → one full-length music layer (legacy shape,
 *                                   hoisted by `normalizeAudioClips`)
 *   video.audio.volume            → music lane gain
 *   video.audio.mix               → master gain, lane gain × volume, lane mute;
 *                                   lane fades seed layers with no fade of their own
 *   video.voiceover.scenes        → one voiceover layer per scene, anchored to it
 *   scene.sceneAudio              → voiceover layer anchored to its scene
 *   sceneElements kind:"audio"    → voiceover layer anchored to its scene
 *
 * V1 lane gains run 0..2 (1 = unity); V2 gains run 0..1, so they are clamped.
 */
import type { AudioLaneConfig, VideoScript } from "@/types/video-script";
import { isUrlTrack, normalizeAudioClips } from "@/lib/audio/normalize-clips";
import {
  DEFAULT_AUDIO_MIX,
  makeAudioLayer,
  type AudioLayer,
  type CanvasAudioMix,
} from "./canvas-state";

/** V1 default music volume when a script names a track but no volume. */
const V1_DEFAULT_MUSIC_VOLUME = 0.6;

export interface ScriptAudio {
  audioLayers: AudioLayer[];
  /** Null when the script carries no audio settings (V2 defaults apply). */
  audioMix: CanvasAudioMix | null;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
}

function isPlayableTrack(track: string | undefined): track is string {
  return !!track && track !== "none" && track !== "custom";
}

function musicLayers(script: VideoScript): AudioLayer[] {
  const audio = script.video.audio;
  const lane: AudioLaneConfig = audio?.mix?.music ?? {};
  return normalizeAudioClips(audio, script.video.duration ?? 0)
    .filter((clip) => isPlayableTrack(clip.track))
    .map((clip) => {
      const legacy = clip.id === "legacy-music";
      const trimStartSec = Math.max(0, clip.trimStartSec ?? 0);
      const playSec = Math.max(0, clip.endSec - clip.startSec);
      return makeAudioLayer({
        id: `music_${clip.id}`,
        kind: "music",
        source: isUrlTrack(clip.track)
          ? { kind: "custom", url: clip.track }
          : { kind: "stock", trackId: clip.track },
        label: clip.label || clip.track,
        durationSeconds: trimStartSec + playSec,
        startOffsetSec: Math.max(0, clip.startSec),
        trimStartSec,
        fadeInSec: clip.fadeInSec || lane.fadeInSec || 0,
        fadeOutSec: clip.fadeOutSec || lane.fadeOutSec || 0,
        // The hoisted legacy clip copies `audio.volume`, which V2 carries
        // as the lane gain — keep the layer at unity so it isn't applied twice.
        gain: legacy ? 1 : clamp01(clip.volume ?? 1),
      });
    });
}

function voiceoverLayers(script: VideoScript): AudioLayer[] {
  const lane: AudioLaneConfig = script.video.audio?.mix?.voiceover ?? {};
  const fades = { fadeInSec: lane.fadeInSec ?? 0, fadeOutSec: lane.fadeOutSec ?? 0 };
  const out: AudioLayer[] = [];
  const seenUrls = new Set<string>();
  const push = (layer: AudioLayer, url: string) => {
    if (seenUrls.has(url)) return;
    seenUrls.add(url);
    out.push(layer);
  };
  const scriptVoiceover = script.video.voiceover?.scenes ?? {};
  for (const s of script.scenes) {
    const tts = scriptVoiceover[s.id];
    if (tts?.audioUrl) {
      push(
        makeAudioLayer({
          id: `vo_${s.id}_tts`,
          kind: "voiceover",
          source: { kind: "custom", url: tts.audioUrl },
          durationSeconds: tts.durationSec > 0 ? tts.durationSec : s.duration,
          anchorSceneId: s.id,
          label: "Voiceover",
          ...fades,
        }),
        tts.audioUrl,
      );
    }
    if (s.sceneAudio) {
      push(
        makeAudioLayer({
          id: `vo_${s.id}_audio`,
          kind: "voiceover",
          source: { kind: "custom", url: s.sceneAudio },
          durationSeconds: s.duration,
          anchorSceneId: s.id,
          label: s.sceneAudioLabel ?? "Scene audio",
          ...fades,
        }),
        s.sceneAudio,
      );
    }
    for (const el of s.sceneElements ?? []) {
      if (el.kind === "audio" && el.url) {
        push(
          makeAudioLayer({
            id: `vo_${el.id}`,
            kind: "voiceover",
            source: { kind: "custom", url: el.url },
            durationSeconds: s.duration,
            anchorSceneId: s.id,
            label: el.label ?? "Audio",
            ...fades,
          }),
          el.url,
        );
      }
    }
  }
  return out;
}

function audioMix(script: VideoScript): CanvasAudioMix | null {
  const audio = script.video.audio;
  if (!audio) return null;
  const mix = audio.mix ?? {};
  return {
    ...DEFAULT_AUDIO_MIX,
    masterGain: clamp01(mix.masterGain ?? 1),
    musicGain: clamp01((audio.volume ?? V1_DEFAULT_MUSIC_VOLUME) * (mix.music?.gain ?? 1)),
    musicMuted: mix.music?.muted ?? false,
    voiceoverGain: clamp01(mix.voiceover?.gain ?? 1),
    voiceoverMuted: mix.voiceover?.muted ?? false,
  };
}

/** Every V1 audio field on a stored script, as V2 audio layers + mix. Music
 *  layers lead (composition order), then voiceovers in scene order. */
export function scriptAudioToCanvas(script: VideoScript): ScriptAudio {
  return {
    audioLayers: [...musicLayers(script), ...voiceoverLayers(script)],
    audioMix: audioMix(script),
  };
}
