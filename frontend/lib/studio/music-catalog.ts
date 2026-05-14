/**
 * Music catalog — single source of truth for the stock music tracks
 * referenced from both the v1 classic sidebar and the v2 canvas
 * editor's Music panel. Track files live in `frontend/public/audio/`.
 *
 * Per the DRY rule: every "Pick a music track" surface reads from
 * MUSIC_TRACKS. Adding a track is one entry here and both editors pick
 * it up automatically.
 */

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

/**
 * Music selection — single union that covers both stock-catalog picks
 * (id-based) and custom music (composed, recorded, or user-uploaded
 * URLs). Every music-aware surface (right-panel Music section, ActionsPanel
 * composer, usePreviewPlayback, canvasStateToTimeline) reads + writes
 * through this shape so there's ONE seam to update.
 */
export type MusicSource =
  | { kind: "stock"; trackId: string }
  | { kind: "custom"; url: string; label: string; durationSeconds: number };

export interface ResolvedMusic {
  /** Playable URL — public asset path for stock, blob:/cdn for custom. */
  src: string;
  /** Display label for timeline / picker highlight. */
  label: string;
  /** Stable id for picker active-state matching (the stock track id for
   *  stock, or `custom:<url>` for custom). */
  selectionId: string;
}

/**
 * Resolve a MusicSource to its label + selection id. Stock entries
 * don't carry a static URL anymore (the catalog was previously pointing
 * at `/audio/*.mp3` files that were never bundled, which made every
 * picker preview + composition playback silent); callers that need a
 * playable URL go through `resolvePlayableSrc()` which lazily
 * generates a WAV blob via the procedural pipeline.
 *
 * Returns null when the source can't be resolved at all (unknown stock
 * id, missing custom URL). Per DRY: every consumer that needs to
 * play/render/display music goes through this helper — no caller
 * hand-rolls the resolution.
 */
export function resolveMusic(source: MusicSource | null): ResolvedMusic | null {
  if (!source) return null;
  if (source.kind === "stock") {
    const track = findMusicTrack(source.trackId);
    if (!track || track.id === "none") return null;
    return { src: track.src, label: track.label, selectionId: track.id };
  }
  if (!source.url) return null;
  return {
    src: source.url,
    label: source.label,
    selectionId: `custom:${source.url}`,
  };
}

/**
 * Resolve a MusicSource to a playable URL — generating the procedural
 * WAV on first request for stock tracks and reusing the cached blob
 * URL thereafter. Returns null when the source can't be resolved.
 * Async because procedural rendering goes through OfflineAudioContext;
 * callers should await + then create their Audio element or HTMLAudio
 * src.
 */
export async function resolvePlayableSrc(
  source: MusicSource | null,
): Promise<string | null> {
  if (!source) return null;
  if (source.kind === "stock") {
    const track = findMusicTrack(source.trackId);
    if (!track || track.id === "none") return null;
    // Static URL (legacy / future real files) wins when present; fall
    // back to procedural rendering otherwise.
    if (track.src) return track.src;
    const { getProceduralMusicUrl, hasProceduralMusic } = await import(
      "./music-procedural"
    );
    if (!hasProceduralMusic(track.id)) return null;
    return getProceduralMusicUrl(track.id);
  }
  return source.url || null;
}
