/**
 * Live piano recording session (#2162 — sustained-chord recording).
 *
 * PianoComposer records `{ freq, startSec, durationSec }` on note-off.
 * The ROADMAP risk was: a triad held with overlapping fingers may
 * collapse to a single `recorded` entry if pointer handling only
 * delivered one note-on, AND notes already held when Record is pressed
 * were dropped because `recordedStartSec` was captured only at note-on.
 *
 * This session is the testable half of that contract:
 *   - each noteId is an independent onset
 *   - overlapping startSec ranges are the chord
 *   - notes already held when recording starts are snapshotted at 0
 *   - stop() flushes still-held notes so a chord held through Stop
 *     still lands in the take
 *
 * PianoComposer.noteOn / noteOff / startRecording / stopRecording
 * should delegate here. Duration uses wall-clock ms relative to
 * record-start (the live AudioContext delta is a caller concern for
 * voice ramping; the recorded take is this timeline).
 */

import type { PlayedNote } from "@/lib/audio/synth-engine";

const MIN_DURATION_SEC = 0.05;

export interface HeldNote {
  noteId: string;
  freq: number;
}

export interface LiveRecordSession {
  readonly recording: boolean;
  /** Notes committed so far (note-off or flushed at stop). */
  notes(): PlayedNote[];
  start(held: readonly HeldNote[], nowMs: number): void;
  stop(nowMs: number): void;
  noteOn(noteId: string, freq: number, nowMs: number): void;
  noteOff(noteId: string, nowMs: number): PlayedNote | null;
  clear(): void;
}

interface Onset {
  freq: number;
  startSec: number;
}

export function notesOverlap(a: PlayedNote, b: PlayedNote): boolean {
  return a.startSec < b.startSec + b.durationSec && b.startSec < a.startSec + a.durationSec;
}

/** True when every note in `notes` pairwise-overlaps at least one other
 *  (a held chord), or when a single time slice contains all of them. */
export function isSustainedChord(notes: readonly PlayedNote[]): boolean {
  if (notes.length < 2) return false;
  // A chord is a set of notes that all overlap a common instant.
  const start = Math.max(...notes.map((n) => n.startSec));
  const end = Math.min(...notes.map((n) => n.startSec + n.durationSec));
  return end > start;
}

export function createLiveRecordSession(): LiveRecordSession {
  let recording = false;
  let startedAtMs: number | null = null;
  const onsets = new Map<string, Onset>();
  let recorded: PlayedNote[] = [];

  function relativeSec(nowMs: number): number {
    if (startedAtMs === null) return 0;
    return Math.max(0, (nowMs - startedAtMs) / 1000);
  }

  function commit(onset: Onset, nowMs: number): PlayedNote {
    const durationSec = Math.max(MIN_DURATION_SEC, relativeSec(nowMs) - onset.startSec);
    const note: PlayedNote = {
      freq: onset.freq,
      startSec: onset.startSec,
      durationSec,
    };
    recorded = [...recorded, note];
    return note;
  }

  const session: LiveRecordSession = {
    get recording() {
      return recording;
    },
    notes() {
      return recorded;
    },
    start(held, nowMs) {
      recorded = [];
      onsets.clear();
      startedAtMs = nowMs;
      recording = true;
      for (const h of held) {
        onsets.set(h.noteId, { freq: h.freq, startSec: 0 });
      }
    },
    stop(nowMs) {
      if (!recording) return;
      for (const [noteId, onset] of onsets) {
        commit(onset, nowMs);
        onsets.delete(noteId);
      }
      recording = false;
      startedAtMs = null;
    },
    noteOn(noteId, freq, nowMs) {
      if (!recording || startedAtMs === null) return;
      if (onsets.has(noteId)) return;
      onsets.set(noteId, { freq, startSec: relativeSec(nowMs) });
    },
    noteOff(noteId, nowMs) {
      const onset = onsets.get(noteId);
      if (!onset) return null;
      onsets.delete(noteId);
      if (!recording || startedAtMs === null) return null;
      return commit(onset, nowMs);
    },
    clear() {
      recorded = [];
      onsets.clear();
      recording = false;
      startedAtMs = null;
    },
  };

  return session;
}
