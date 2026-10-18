/**
 * Legacy audio migration — the pre-v2 single `musicSource` +
 * `voiceovers[]` shape and the forward migration into `audioLayers[]`.
 * Part of the canvas-state model; re-exported by `../canvas-state`.
 */

import { findMusicTrack } from "../../music-catalog";
import type { AudioLayer, AudioLayerKind, AudioLayerSource } from "./audio-types";
import { makeAudioLayer } from "./audio-layers";

// ─── Legacy audio shape (pre-v2 drafts / Timeline round-trip) ──────────────
// The old single-music + voiceovers[] shape. Kept ONLY so `buildAudioLayers`
// can migrate a persisted draft forward; nothing authors these anymore.
export interface LegacyMusicSource {
  kind: "stock" | "custom";
  trackId?: string;
  url?: string;
  label?: string;
  durationSeconds?: number;
  startOffsetSec?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
}
export interface LegacyVoiceover {
  id?: string;
  url?: string;
  durationSeconds?: number;
  anchorSceneId?: string | null;
  label?: string;
  text?: string;
  gain?: number;
  muted?: boolean;
  startOffsetSec?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  trimStartSec?: number;
  trimEndSec?: number;
}

/** Map a legacy `musicSource` union to a music `AudioLayer`. Stock keeps
 *  its catalog duration; custom carries its url + saved duration. */
export function audioLayerFromLegacyMusic(
  src: LegacyMusicSource | null | undefined,
): AudioLayer | null {
  if (!src) return null;
  if (src.kind === "stock") {
    if (!src.trackId || src.trackId === "none") return null;
    const track = findMusicTrack(src.trackId);
    return makeAudioLayer({
      kind: "music",
      source: { kind: "stock", trackId: src.trackId },
      label: track?.label ?? "Music",
      durationSeconds: track?.durationSeconds ?? 0,
      startOffsetSec: src.startOffsetSec ?? 0,
      fadeInSec: src.fadeInSec ?? 0,
      fadeOutSec: src.fadeOutSec ?? 0,
    });
  }
  if (!src.url) return null;
  return makeAudioLayer({
    kind: "music",
    source: { kind: "custom", url: src.url },
    label: src.label ?? "Music",
    durationSeconds: src.durationSeconds ?? 0,
    startOffsetSec: src.startOffsetSec ?? 0,
    fadeInSec: src.fadeInSec ?? 0,
    fadeOutSec: src.fadeOutSec ?? 0,
  });
}

/** Map a legacy voiceover clip to a voiceover `AudioLayer`. */
function audioLayerFromLegacyVoiceover(vo: LegacyVoiceover): AudioLayer {
  return makeAudioLayer({
    id: vo.id,
    kind: "voiceover",
    source: { kind: "custom", url: vo.url ?? "" },
    label: vo.label ?? "Voiceover",
    durationSeconds: vo.durationSeconds ?? 0,
    anchorSceneId: vo.anchorSceneId ?? null,
    startOffsetSec: vo.startOffsetSec ?? 0,
    trimStartSec: vo.trimStartSec ?? 0,
    trimEndSec: vo.trimEndSec ?? 0,
    fadeInSec: vo.fadeInSec ?? 0,
    fadeOutSec: vo.fadeOutSec ?? 0,
    gain: vo.gain ?? 1,
    muted: vo.muted ?? false,
    text: vo.text,
  });
}

/** Resolve the `audioLayers[]` for a draft that may be in either the
 *  current shape OR a pre-v2 shape (`musicSource` + `voiceovers[]`).
 *  When `audioLayers` is already present it wins; otherwise the legacy
 *  fields are converted. Single migration seam — used by
 *  `normalizeCanvasState` + the Timeline round-trip recover. */
export function buildAudioLayers(raw: {
  audioLayers?: unknown;
  musicSource?: LegacyMusicSource | null;
  voiceovers?: LegacyVoiceover[];
}): AudioLayer[] {
  if (Array.isArray(raw.audioLayers)) {
    // Backfill any missing timing fields so an older `audioLayers` draft
    // (or a hand-built fixture) reads cleanly.
    return (raw.audioLayers as Partial<AudioLayer>[])
      .filter((l) => l && l.kind && l.source)
      .map((l) =>
        makeAudioLayer({
          kind: l.kind as AudioLayerKind,
          source: l.source as AudioLayerSource,
          label: l.label ?? "Audio",
          durationSeconds: l.durationSeconds ?? 0,
          id: l.id,
          anchorSceneId: l.anchorSceneId ?? null,
          startOffsetSec: l.startOffsetSec,
          trimStartSec: l.trimStartSec,
          trimEndSec: l.trimEndSec,
          fadeInSec: l.fadeInSec,
          fadeOutSec: l.fadeOutSec,
          gain: l.gain,
          muted: l.muted,
          text: l.text,
        }),
      );
  }
  const out: AudioLayer[] = [];
  const music = audioLayerFromLegacyMusic(raw.musicSource);
  if (music) out.push(music);
  for (const vo of raw.voiceovers ?? []) {
    out.push(audioLayerFromLegacyVoiceover(vo));
  }
  return out;
}
