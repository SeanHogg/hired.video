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
