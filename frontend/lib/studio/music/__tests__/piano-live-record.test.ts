/**
 * #2162 — sustained-chord recording: each overlapping finger must
 * produce its own PlayedNote with overlapping startSec ranges.
 *
 * Run: npx vitest run lib/studio/music/__tests__/piano-live-record.test.ts
 */

import { describe, expect, it } from "vitest";
import { NOTE_FREQUENCIES } from "@/lib/audio/synth-engine";
import {
  createLiveRecordSession,
  isSustainedChord,
  notesOverlap,
} from "../piano-live-record";

const C4 = NOTE_FREQUENCIES.C4;
const E4 = NOTE_FREQUENCIES.E4;
const G4 = NOTE_FREQUENCIES.G4;

describe("createLiveRecordSession", () => {
  it("records a triad as three overlapping notes, not one", () => {
    const rec = createLiveRecordSession();
    rec.start([], 1_000);
    rec.noteOn("C4", C4, 1_000);
    rec.noteOn("E4", E4, 1_050);
    rec.noteOn("G4", G4, 1_080);
    rec.noteOff("C4", 1_800);
    rec.noteOff("E4", 1_820);
    rec.noteOff("G4", 1_850);

    const notes = rec.notes();
    expect(notes).toHaveLength(3);
    expect(notes.map((n) => n.freq)).toEqual([C4, E4, G4]);
    expect(isSustainedChord(notes)).toBe(true);
    expect(notesOverlap(notes[0], notes[1])).toBe(true);
    expect(notesOverlap(notes[0], notes[2])).toBe(true);
    expect(notesOverlap(notes[1], notes[2])).toBe(true);
  });

  it("snapshots notes already held when Record is pressed at startSec=0", () => {
    const rec = createLiveRecordSession();
    rec.start(
      [
        { noteId: "C4", freq: C4 },
        { noteId: "E4", freq: E4 },
        { noteId: "G4", freq: G4 },
      ],
      5_000,
    );
    rec.noteOff("C4", 5_400);
    rec.noteOff("E4", 5_400);
    rec.noteOff("G4", 5_400);

    const notes = rec.notes();
    expect(notes).toHaveLength(3);
    for (const n of notes) {
      expect(n.startSec).toBe(0);
      expect(n.durationSec).toBeCloseTo(0.4, 5);
    }
    expect(isSustainedChord(notes)).toBe(true);
  });

  it("flushes still-held notes when Stop is pressed", () => {
    const rec = createLiveRecordSession();
    rec.start([], 0);
    rec.noteOn("C4", C4, 0);
    rec.noteOn("E4", E4, 10);
    rec.stop(500);

    const notes = rec.notes();
    expect(notes).toHaveLength(2);
    expect(isSustainedChord(notes)).toBe(true);
    expect(rec.recording).toBe(false);
  });

  it("does not record a note that started and ended outside the take", () => {
    const rec = createLiveRecordSession();
    rec.noteOn("C4", C4, 0);
    rec.noteOff("C4", 200);
    expect(rec.notes()).toHaveLength(0);

    rec.start([], 1_000);
    rec.noteOn("E4", E4, 1_000);
    rec.noteOff("E4", 1_200);
    expect(rec.notes()).toHaveLength(1);
    expect(rec.notes()[0].freq).toBe(E4);
  });

  it("ignores a second noteOn for the same noteId while it is held", () => {
    const rec = createLiveRecordSession();
    rec.start([], 0);
    rec.noteOn("C4", C4, 0);
    rec.noteOn("C4", C4, 50);
    rec.noteOff("C4", 300);
    expect(rec.notes()).toHaveLength(1);
    expect(rec.notes()[0].startSec).toBe(0);
  });

  it("enforces a minimum duration so a tap still renders", () => {
    const rec = createLiveRecordSession();
    rec.start([], 0);
    rec.noteOn("C4", C4, 0);
    rec.noteOff("C4", 10); // 10ms
    expect(rec.notes()[0].durationSec).toBe(0.05);
  });

  it("clear() drops the take and onsets", () => {
    const rec = createLiveRecordSession();
    rec.start([], 0);
    rec.noteOn("C4", C4, 0);
    rec.noteOff("C4", 200);
    rec.clear();
    expect(rec.notes()).toHaveLength(0);
    expect(rec.recording).toBe(false);
  });
});

describe("notesOverlap / isSustainedChord", () => {
  it("returns false for sequential non-overlapping notes", () => {
    expect(
      notesOverlap(
        { freq: C4, startSec: 0, durationSec: 0.2 },
        { freq: E4, startSec: 0.3, durationSec: 0.2 },
      ),
    ).toBe(false);
    expect(
      isSustainedChord([
        { freq: C4, startSec: 0, durationSec: 0.2 },
        { freq: E4, startSec: 0.3, durationSec: 0.2 },
      ]),
    ).toBe(false);
  });

  it("returns false for a single note", () => {
    expect(isSustainedChord([{ freq: C4, startSec: 0, durationSec: 1 }])).toBe(false);
  });
});
