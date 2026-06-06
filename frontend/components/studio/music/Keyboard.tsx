// Keyboard.tsx — shared playable-keyboard surface for every Studio
// music composer (the simple PianoComposer and the full SynthComposer).
//
// Extracted from PianoComposer so the two surfaces can never drift on
// layout, octave paging, hotkey map, or pointer/touch handling (per the
// studio DRY rule: same logic in 2+ places → one shared component).
// This file is purely presentational + input — it knows nothing about
// how a note is synthesised. Consumers wire onNoteOn/onNoteOff to their
// own engine (raw Web Audio for PianoComposer, Tone.js LiveSynth for
// SynthComposer).

import { useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NOTE_FREQUENCIES } from "@/lib/audio/synth-engine";

// One octave worth of naturals — the loop generates every octave from
// these so the renderer never branches on octave number.
const NATURAL = ["C", "D", "E", "F", "G", "A", "B"];
const SHARP_AFTER: Record<string, boolean> = { C: true, D: true, F: true, G: true, A: true };

// QWERTY-row mapping for one visible octave. Lower row = naturals,
// upper row = sharps. Matches the layout most DAWs use so muscle
// memory transfers.
export const KEY_MAP_NATURAL = ["a", "s", "d", "f", "g", "h", "j"]; // C D E F G A B
export const KEY_MAP_SHARP = ["w", "e", "t", "y", "u"]; //          C# D#   F# G# A#

export const VISIBLE_OCTAVES = 3; // 3 octaves shown at once
export const MIN_OCTAVE = 0;
// Octave 8 only has C8 in NOTE_FREQUENCIES; allow a startOctave of 6 so
// the loop (6,7,8) still puts C8 at the right edge, otherwise the top of
// the 88-key range is unreachable.
export const MAX_OCTAVE = 9 - VISIBLE_OCTAVES;

export interface KeyDef {
  noteId: string; // e.g. "C4", "F#5"
  freq: number;
  natural: boolean;
  octave: number;
  /** Computer-key for the key when in the highlighted octave (else null). */
  hotkey: string | null;
}

export function buildKeys(startOctave: number, hotkeyOctave: number): KeyDef[] {
  const out: KeyDef[] = [];
  for (let o = startOctave; o < startOctave + VISIBLE_OCTAVES; o++) {
    NATURAL.forEach((n, i) => {
      const noteId = `${n}${o}`;
      const freq = NOTE_FREQUENCIES[noteId];
      if (freq) {
        out.push({
          noteId,
          freq,
          natural: true,
          octave: o,
          hotkey: o === hotkeyOctave ? KEY_MAP_NATURAL[i] : null,
        });
      }
      if (SHARP_AFTER[n]) {
        const sharpId = `${n}#${o}`;
        const sharpFreq = NOTE_FREQUENCIES[sharpId];
        if (sharpFreq) {
          const sharpIdx = ["C", "D", "F", "G", "A"].indexOf(n);
          out.push({
            noteId: sharpId,
            freq: sharpFreq,
            natural: false,
            octave: o,
            hotkey: o === hotkeyOctave ? KEY_MAP_SHARP[sharpIdx] : null,
          });
        }
      }
    });
  }
  return out;
}

/**
 * Wire the computer keyboard to the currently visible octave. Lives
 * here so both composers get identical key-repeat suppression + held-key
 * bookkeeping. Re-binds whenever the visible keys change (octave shift).
 */
export function useComputerKeyboard(
  keys: KeyDef[],
  onNoteOn: (k: KeyDef) => void,
  onNoteOff: (k: KeyDef) => void,
): void {
  const keysByHotkey = useMemo(() => {
    const m = new Map<string, KeyDef>();
    for (const k of keys) if (k.hotkey) m.set(k.hotkey, k);
    return m;
  }, [keys]);

  useEffect(() => {
    const held = new Set<string>();
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (held.has(k)) return;
      const key = keysByHotkey.get(k);
      if (!key) return;
      held.add(k);
      onNoteOn(key);
      e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!held.has(k)) return;
      held.delete(k);
      const key = keysByHotkey.get(k);
      if (key) onNoteOff(key);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [keysByHotkey, onNoteOn, onNoteOff]);
}

/** Octave-paging control shared by every composer toolbar — keeps the
 *  "C{n}–C{n+3}" readout + clamp logic in one place. */
export function OctaveShifter({
  startOctave,
  onChange,
}: {
  startOctave: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onChange(Math.max(MIN_OCTAVE, startOctave - 1))}
        disabled={startOctave <= MIN_OCTAVE}
        title="Shift octave down"
      >
        <ChevronLeft className="h-3 w-3" />
      </Button>
      <span className="text-[10px] font-mono text-muted-foreground px-1">
        C{startOctave}–C{startOctave + VISIBLE_OCTAVES}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onChange(Math.min(MAX_OCTAVE, startOctave + 1))}
        disabled={startOctave >= MAX_OCTAVE}
        title="Shift octave up"
      >
        <ChevronRight className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ── renderer ────────────────────────────────────────────────────────────────

const WHITE_W = 36; // px
const WHITE_H = 144;
const BLACK_W = 24;
const BLACK_H = 90;

export function Keyboard({
  keys,
  activeNotes,
  onNoteOn,
  onNoteOff,
}: {
  keys: KeyDef[];
  activeNotes: Set<string>;
  onNoteOn: (k: KeyDef) => void;
  onNoteOff: (k: KeyDef) => void;
}) {
  const naturals = keys.filter((k) => k.natural);
  const sharps = keys.filter((k) => !k.natural);

  // Each sharp sits AFTER a natural; position it over the boundary.
  function naturalIndexBefore(sharpId: string): number {
    const letter = sharpId[0];
    const octave = parseInt(sharpId.slice(sharpId.indexOf("#") + 1), 10);
    return naturals.findIndex((n) => n.noteId === `${letter}${octave}`);
  }

  return (
    <div className="bg-zinc-900 rounded-md p-2 overflow-x-auto">
      <div
        className="relative inline-block"
        style={{ width: naturals.length * WHITE_W, height: WHITE_H, userSelect: "none" }}
      >
        {/* White keys */}
        <div className="flex absolute inset-0">
          {naturals.map((k) => (
            <PianoKey
              key={k.noteId}
              keyDef={k}
              active={activeNotes.has(k.noteId)}
              onDown={() => onNoteOn(k)}
              onUp={() => onNoteOff(k)}
              className={cn(
                "border border-zinc-800 rounded-b-md flex flex-col items-center justify-end pb-1 transition-colors",
                activeNotes.has(k.noteId) ? "bg-primary/80" : "bg-white hover:bg-zinc-100",
              )}
              style={{ width: WHITE_W - 2, height: WHITE_H, marginRight: 2 }}
              labelClass={activeNotes.has(k.noteId) ? "text-primary-foreground" : "text-zinc-700"}
            />
          ))}
        </div>
        {/* Black keys overlay */}
        {sharps.map((k) => {
          const idx = naturalIndexBefore(k.noteId);
          if (idx < 0) return null;
          const left = (idx + 1) * WHITE_W - BLACK_W / 2 - 1;
          return (
            <PianoKey
              key={k.noteId}
              keyDef={k}
              active={activeNotes.has(k.noteId)}
              onDown={() => onNoteOn(k)}
              onUp={() => onNoteOff(k)}
              className={cn(
                "absolute top-0 rounded-b-md flex flex-col items-center justify-end pb-1 transition-colors z-10 border border-black",
                activeNotes.has(k.noteId) ? "bg-primary" : "bg-zinc-900 hover:bg-zinc-800",
              )}
              style={{ left, width: BLACK_W, height: BLACK_H }}
              labelClass={activeNotes.has(k.noteId) ? "text-primary-foreground" : "text-zinc-300"}
            />
          );
        })}
      </div>
    </div>
  );
}

// One key — owns its own pointer + touch lifecycle so the parent doesn't
// leak listener spaghetti. noteOff always fires on pointerup OR
// pointerleave so a drag-off-the-key doesn't leave a stuck note.
function PianoKey({
  keyDef,
  active,
  onDown,
  onUp,
  className,
  style,
  labelClass,
}: {
  keyDef: KeyDef;
  active: boolean;
  onDown: () => void;
  onUp: () => void;
  className?: string;
  style?: React.CSSProperties;
  labelClass?: string;
}) {
  const heldRef = useRef(false);
  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (heldRef.current) return;
    heldRef.current = true;
    onDown();
  };
  const end = () => {
    if (!heldRef.current) return;
    heldRef.current = false;
    onUp();
  };
  return (
    <div
      role="button"
      aria-label={`${keyDef.noteId} key`}
      aria-pressed={active}
      tabIndex={-1}
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      className={cn("cursor-pointer", className)}
      style={style}
    >
      <span className={cn("text-[8px] font-mono pointer-events-none", labelClass)}>
        {keyDef.noteId}
        {keyDef.hotkey && <span className="ml-0.5 opacity-70">[{keyDef.hotkey}]</span>}
      </span>
    </div>
  );
}
