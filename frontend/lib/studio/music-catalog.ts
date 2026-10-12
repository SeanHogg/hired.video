/**
 * Music catalog — single source of truth for the stock music tracks
 * referenced from both the v1 classic sidebar and the v2 canvas
 * editor's Music panel. Track files live in `frontend/public/audio/`.
 *
 * Per the DRY rule: every "Pick a music track" surface reads from
 * MUSIC_TRACKS. Adding a track is one entry here and both editors pick
 * it up automatically.
 */

import { isUrlTrack } from "@/lib/audio/normalize-clips";

export type MusicGenre =
  | "Corporate"
  | "Electronic"
  | "Pop"
  | "Cinematic"
  | "Ambient"
  | "None";

export interface MusicTrack {
  /** Stable id used as the `audioClip.source` value. */
  id: string;
  label: string;
  genre: MusicGenre;
  /** Public asset path (loaded by the audio mixer + preview player). */
  src: string;
  /** Approximate length in seconds — surfaced in the picker label. */
  durationSeconds: number;
}

// Stock tracks are rendered procedurally at first play (see
// `music-procedural.ts`). `src` stays in the type for back-compat with
// any code that still reads it, but the source of truth for "what does
// this track sound like?" is the procedural generator keyed off `id`.
export const MUSIC_TRACKS: MusicTrack[] = [
  {
    id: "corporate-inspire",
    label: "Corporate Inspire",
    genre: "Corporate",
    src: "",
    durationSeconds: 28,
  },
  {
    id: "tech-ambient",
    label: "Tech Ambient",
    genre: "Electronic",
    src: "",
    durationSeconds: 24,
  },
  {
    id: "upbeat-career",
    label: "Upbeat Career",
    genre: "Pop",
    src: "",
    durationSeconds: 24,
  },
  {
    id: "cinematic-rise",
    label: "Cinematic Rise",
    genre: "Cinematic",
    src: "",
    durationSeconds: 32,
  },
  {
    id: "minimal-focus",
    label: "Minimal Focus",
    genre: "Ambient",
    src: "",
    durationSeconds: 24,
  },
  { id: "none", label: "None", genre: "None", src: "", durationSeconds: 0 },
];

export function findMusicTrack(id: string): MusicTrack | null {
  return MUSIC_TRACKS.find((t) => t.id === id) ?? null;
}

// ─── Audio-layer source resolution ─────────────────────────────────────────
// The multi-track audio model stores each layer's source as a structural
// `{ kind: "stock"; trackId } | { kind: "custom"; url }` union (see
// `AudioLayer` in canvas-state.ts). These helpers are the SINGLE seam
// between that union and any playable / addressable representation, so
// preview, render emit, and the mixer can't derive URLs differently.
// Typed structurally (no canvas-state import) to avoid a module cycle.

export type AudioLayerSourceLike =
  | { kind: "stock"; trackId: string }
  | { kind: "custom"; url: string };

/** Shared stock → playable-URL resolver. Static catalog URL wins when
 *  present (legacy / future real files); otherwise procedural render. */
async function resolvePlayableStock(trackId: string): Promise<string | null> {
  const track = findMusicTrack(trackId);
  if (!track || track.id === "none") return null;
  if (track.src) return track.src;
  const { getProceduralMusicUrl, hasProceduralMusic } = await import(
    "./music-procedural"
  );
  if (!hasProceduralMusic(track.id)) return null;
  return getProceduralMusicUrl(track.id);
}

/** Stable selection id for a layer source — `<trackId>` for stock,
 *  `custom:<url>` for custom. Used as the render-side `sourceId` suffix
 *  (`music:<selectionId>`) and the picker's active-state key. */
export function audioLayerSelectionId(source: AudioLayerSourceLike): string {
  return source.kind === "stock" ? source.trackId : `custom:${source.url}`;
}

/** Resolve a layer source to its playable URL — generating procedural
 *  stock WAVs on first use, returning the custom url verbatim. Null when
 *  unresolvable (unknown stock id / empty custom url). */
export async function resolvePlayableLayerSrc(
  source: AudioLayerSourceLike,
): Promise<string | null> {
  if (source.kind === "stock") return resolvePlayableStock(source.trackId);
  return source.url || null;
}

/** Resolve a scheduler `track` (a URL, or a stock id from `resolveLayerTrack`)
 *  to the URL the EXPORT mixes — the static catalog file or the procedural
 *  WAV render — so the live preview plays the same audio the MP4 carries
 *  (#742). Tracks that aren't catalog ids (legacy V1 preset keys) come back
 *  unchanged for the scheduler's preset driver. */
export async function resolvePlayableTrack(track: string): Promise<string> {
  if (isUrlTrack(track)) return track;
  if (!findMusicTrack(track)) return track;
  try {
    return (await resolvePlayableStock(track)) ?? track;
  } catch {
    // Procedural render failed — fall back to the raw id (silent preview
    // rather than a broken one).
    return track;
  }
}

/** Resolve a stock layer source to the scheduler's `track` value — the
 *  static catalog src when present, else the track id (the live preview
 *  maps stock ids to the procedural render via `resolvePlayableTrack`). Custom returns
 *  its url. Null when the stock id is unknown / "none". Mirrors the old
 *  single-source `resolvedMusic()` seam, now per layer. */
export function resolveLayerTrack(
  source: AudioLayerSourceLike,
): string | null {
  if (source.kind === "stock") {
    const track = findMusicTrack(source.trackId);
    if (!track || track.id === "none") return null;
    return track.src || track.id;
  }
  return source.url || null;
}
