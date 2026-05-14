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

export const MUSIC_TRACKS: MusicTrack[] = [
  {
    id: "corporate-inspire",
    label: "Corporate Inspire",
    genre: "Corporate",
    src: "/audio/corporate-inspire.mp3",
    durationSeconds: 120,
  },
  {
    id: "tech-ambient",
    label: "Tech Ambient",
    genre: "Electronic",
    src: "/audio/tech-ambient.mp3",
    durationSeconds: 95,
  },
  {
    id: "upbeat-career",
    label: "Upbeat Career",
    genre: "Pop",
    src: "/audio/upbeat-career.mp3",
    durationSeconds: 105,
  },
  {
    id: "cinematic-rise",
    label: "Cinematic Rise",
    genre: "Cinematic",
    src: "/audio/cinematic-rise.mp3",
    durationSeconds: 140,
  },
  {
    id: "minimal-focus",
    label: "Minimal Focus",
    genre: "Ambient",
    src: "/audio/minimal-focus.mp3",
    durationSeconds: 90,
  },
  { id: "none", label: "None", genre: "None", src: "", durationSeconds: 0 },
];

export function findMusicTrack(id: string): MusicTrack | null {
  return MUSIC_TRACKS.find((t) => t.id === id) ?? null;
}

/**
 * Music selection — single union that covers both stock-catalog picks
 * (id-based) and custom music (composed, recorded, or user-uploaded
 * URLs). Every music-aware surface (DesignPanel picker, ActionsPanel
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
 * Resolve a MusicSource to its playable URL + label. Returns null when
 * the source can't be resolved (unknown stock id, missing URL). Per
 * DRY: every consumer that needs to play/render/display music goes
 * through this helper — no caller hand-rolls the resolution.
 */
export function resolveMusic(source: MusicSource | null): ResolvedMusic | null {
  if (!source) return null;
  if (source.kind === "stock") {
    const track = findMusicTrack(source.trackId);
    if (!track?.src) return null;
    return { src: track.src, label: track.label, selectionId: track.id };
  }
  if (!source.url) return null;
  return {
    src: source.url,
    label: source.label,
    selectionId: `custom:${source.url}`,
  };
}
