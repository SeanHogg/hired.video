/**
 * Versioning / migration — normalize a parsed or persisted draft onto
 * the current `CanvasState` shape. Part of the canvas-state model;
 * re-exported by `../canvas-state`.
 */

import { buildAudioLayers, type LegacyMusicSource, type LegacyVoiceover } from "./audio-migration";
import { emptyCanvasState } from "./constructors";
import type { CanvasState } from "./scene-types";

/** Normalize a parsed/persisted draft onto the current shape. Fills any
 *  missing top-level fields from `emptyCanvasState()` (present keys win)
 *  AND migrates a pre-v2 audio shape (`musicSource` + `voiceovers[]`)
 *  forward into `audioLayers[]`. Single seam for the localStorage load
 *  path + any other place a raw draft enters the editor. */
export function normalizeCanvasState(raw: unknown): CanvasState {
  const base = emptyCanvasState();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const merged = { ...base, ...(r as Partial<CanvasState>) } as CanvasState & {
    musicSource?: unknown;
    voiceovers?: unknown;
  };
  merged.audioLayers = buildAudioLayers({
    audioLayers: (r as { audioLayers?: unknown }).audioLayers,
    musicSource: (r as { musicSource?: LegacyMusicSource | null }).musicSource,
    voiceovers: (r as { voiceovers?: LegacyVoiceover[] }).voiceovers,
  });
  // Drop the dead legacy keys so they don't linger on the in-memory state.
  delete merged.musicSource;
  delete merged.voiceovers;
  return merged;
}
