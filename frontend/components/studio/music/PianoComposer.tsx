// PianoComposer.tsx — playable keyboard + live recording surface for
// in-Studio music beds. Ported from C:\code\hired\synth (Piano.tsx),
// stripped of Tone.js / abcjs / preset I/O. Uses the same shared
// synth-engine + WAV encoder as OriginalMusicComposer so the two
// surfaces produce indistinguishable timbres.
//
// What's here:
//  - 3-octave keyboard (C3..C6 by default), octave shift buttons,
//    full 88 keys reachable by paging through octaves
//  - Mouse + touch press/release → live note on/off (real duration,
//    not the synth's fixed 0.5s)
//  - Computer keyboard map (asdfghjk... + wertyu... for sharps), one
//    octave covered at a time
//  - Recording = capture `{ freq, startSec, durationSec }` events
//  - Playback over live AudioContext for preview
//  - Render to WAV via OfflineAudioContext (shared
//    renderPlayedNotesToBuffer) → Blob to the music lane
//
// Still deferred to gap #457: ENV/LFO modulation, abcjs sheet-music
// render, JSON preset save/load, unison voices/detune/spread,
// multiple oscillator stacks per voice, MIDI input, pedal sustain.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, Play, Trash2, Loader2, Download, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { audioBufferToWav } from "@/lib/audio/wav";
import {
  schedulePitchedNote,
  renderPlayedNotesToBuffer,
  NOTE_FREQUENCIES,
  DEFAULT_ADSR,
  type ADSR,
  type Waveform,
  type PlayedNote,
} from "@/lib/audio/synth-engine";
import { WaveformPicker } from "./WaveformPicker";
import { AdsrControls } from "./AdsrControls";

// One octave worth of notes — the loop generates every octave from
// these so the keyboard renderer never branches on octave number.
const NATURAL = ["C", "D", "E", "F", "G", "A", "B"];
const SHARP_AFTER: Record<string, boolean> = { C: true, D: true, F: true, G: true, A: true };

// QWERTY-row mapping for one visible octave. Lower row = naturals,
// upper row = sharps. Matches the layout most DAWs use so muscle
// memory transfers.
const KEY_MAP_NATURAL = ["a", "s", "d", "f", "g", "h", "j"]; // C D E F G A B
const KEY_MAP_SHARP   = ["w", "e",       "t", "y", "u"];     // C# D#   F# G# A#  (E and B have no sharp)

const VISIBLE_OCTAVES = 3; // 3 octaves shown at once (fits 84 white keys would be too wide)
const MIN_OCTAVE = 0;
// Octave 8 only has C8 in NOTE_FREQUENCIES; allow a startOctave of 6
// so the loop (6,7,8) still puts C8 at the right edge, otherwise the
// top of the 88-key range is unreachable.
const MAX_OCTAVE = 9 - VISIBLE_OCTAVES;

interface KeyDef {
  noteId: string;     // e.g. "C4", "F#5"
  freq: number;
  natural: boolean;
  octave: number;
  /** Computer-key for the key when in the highlighted octave (else null). */
  hotkey: string | null;
}

function buildKeys(startOctave: number, hotkeyOctave: number): KeyDef[] {
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
          // sharp index in KEY_MAP_SHARP follows the natural's index
          // skipping the gap at E (no E#) and B (no B#).
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

interface VoiceHandle {
  /** When the note started (live AudioContext.currentTime). */
  startedAt: number;
  /** Wall-clock startSec relative to recordingStart, captured at note-on. */
  recordedStartSec: number | null;
  /** Gain node we ramp to 0 on note-off so release works. */
  gain: GainNode;
  osc: OscillatorNode;
}

interface Props {
  onMusicReady?: (blob: Blob, durationSec: number) => void;
}

export default function PianoComposer({ onMusicReady }: Props) {
  // ── Config (shared with OriginalMusicComposer's primitives) ────────────
  const [waveform, setWaveform] = useState<Waveform>("triangle");
  const [adsr, setAdsr] = useState<ADSR>(DEFAULT_ADSR);
  const [filterCutoff, setFilterCutoff] = useState(8000);

  // ── Keyboard view state ────────────────────────────────────────────────
  // startOctave = leftmost visible octave; hotkeyOctave = which visible
  // octave the QWERTY row maps to (the middle one by default).
  const [startOctave, setStartOctave] = useState(3); // C3..C6 visible
  const hotkeyOctave = startOctave + 1;              // middle octave
  const keys = useMemo(() => buildKeys(startOctave, hotkeyOctave), [startOctave, hotkeyOctave]);
  const keysByHotkey = useMemo(() => {
    const m = new Map<string, KeyDef>();
    for (const k of keys) if (k.hotkey) m.set(k.hotkey, k);
    return m;
  }, [keys]);

  // ── Live audio + recording ────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const masterFilterRef = useRef<BiquadFilterNode | null>(null);
  const voicesRef = useRef<Map<string, VoiceHandle>>(new Map());
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());

  const [isRecording, setIsRecording] = useState(false);
  const recordingStartRef = useRef<number | null>(null); // performance.now() at record-start
  const [recorded, setRecorded] = useState<PlayedNote[]>([]);

  const [isRendering, setIsRendering] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const renderedBlobRef = useRef<Blob | null>(null);
  const [renderTailSec, setRenderTailSec] = useState(2); // padding after last note

  const ensureContext = useCallback(() => {
    if (ctxRef.current) return ctxRef.current;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    ctxRef.current = ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterCutoff;
    filter.Q.value = 0.7;
    filter.connect(ctx.destination);
    masterFilterRef.current = filter;
    return ctx;
  }, [filterCutoff]);

  // Reactive cutoff updates — only fires after the context exists.
  useEffect(() => {
    if (masterFilterRef.current && ctxRef.current) {
      masterFilterRef.current.frequency.setValueAtTime(filterCutoff, ctxRef.current.currentTime);
    }
  }, [filterCutoff]);

  const invalidateRender = useCallback(() => {
    if (renderedUrl) {
      URL.revokeObjectURL(renderedUrl);
      setRenderedUrl(null);
      renderedBlobRef.current = null;
    }
  }, [renderedUrl]);

  // ── Note on / off ─────────────────────────────────────────────────────
  const noteOn = useCallback((key: KeyDef) => {
    if (voicesRef.current.has(key.noteId)) return; // already held
    const ctx = ensureContext();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const dest = masterFilterRef.current ?? ctx.destination;
    const t = ctx.currentTime;

    // Manual ADSR setup so we can release on noteOff (the offline
    // helper bakes in a fixed noteDur, which doesn't fit live play).
    const peak = 0.18;
    const osc = ctx.createOscillator();
    osc.type = waveform;
    osc.frequency.setValueAtTime(key.freq, t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    const aEnd = t + adsr.attack;
    gain.gain.linearRampToValueAtTime(peak, aEnd);
    gain.gain.linearRampToValueAtTime(peak * adsr.sustain, aEnd + adsr.decay);
    osc.connect(gain).connect(dest);
    osc.start(t);

    const recordedStartSec = isRecording && recordingStartRef.current !== null
      ? (performance.now() - recordingStartRef.current) / 1000
      : null;

    voicesRef.current.set(key.noteId, { startedAt: t, recordedStartSec, gain, osc });
    setActiveNotes((s) => new Set(s).add(key.noteId));
  }, [adsr.attack, adsr.decay, adsr.sustain, ensureContext, isRecording, waveform]);

  const noteOff = useCallback((key: KeyDef) => {
    const voice = voicesRef.current.get(key.noteId);
    if (!voice) return;
    voicesRef.current.delete(key.noteId);
    const ctx = ctxRef.current;
    if (!ctx) return;
    const tOff = ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(tOff);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, tOff);
    voice.gain.gain.linearRampToValueAtTime(0, tOff + adsr.release);
    voice.osc.stop(tOff + adsr.release + 0.01);

    setActiveNotes((s) => {
      const next = new Set(s);
      next.delete(key.noteId);
      return next;
    });

    if (voice.recordedStartSec !== null) {
      const durationSec = Math.max(0.05, tOff - voice.startedAt);
      setRecorded((prev) => [
        ...prev,
        { freq: key.freq, startSec: voice.recordedStartSec!, durationSec },
      ]);
      invalidateRender();
    }
  }, [adsr.release, invalidateRender]);

  // ── Computer-keyboard handling ────────────────────────────────────────
  useEffect(() => {
    const held = new Set<string>();
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (held.has(k)) return;
      const key = keysByHotkey.get(k);
      if (!key) return;
      held.add(k);
      noteOn(key);
      e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!held.has(k)) return;
      held.delete(k);
      const key = keysByHotkey.get(k);
      if (key) noteOff(key);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [keysByHotkey, noteOn, noteOff]);

  // Cleanup audio on unmount.
  useEffect(() => () => {
    voicesRef.current.forEach((v) => { try { v.osc.stop(); } catch { /* already stopped */ } });
    voicesRef.current.clear();
    ctxRef.current?.close().catch(() => {});
  }, []);

  // ── Recording controls ────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    setRecorded([]);
    invalidateRender();
    recordingStartRef.current = performance.now();
    setIsRecording(true);
  }, [invalidateRender]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    recordingStartRef.current = null;
  }, []);

  const clearRecording = useCallback(() => {
    setRecorded([]);
    invalidateRender();
  }, [invalidateRender]);

  // ── Render to WAV (shared offline pipeline) ───────────────────────────
  const lastNoteEndSec = useMemo(() => {
    let m = 0;
    for (const n of recorded) m = Math.max(m, n.startSec + n.durationSec);
    return m;
  }, [recorded]);

  const renderWav = useCallback(async () => {
    if (recorded.length === 0) return;
    setIsRendering(true);
    try {
      const durationSec = lastNoteEndSec + renderTailSec;
      const buf = await renderPlayedNotesToBuffer({
        notes: recorded,
        durationSec,
        waveform,
        adsr,
        filterCutoff,
      });
      const wav = audioBufferToWav(buf);
      const blob = new Blob([wav], { type: "audio/wav" });
      renderedBlobRef.current = blob;
      setRenderedUrl(URL.createObjectURL(blob));
    } finally {
      setIsRendering(false);
    }
  }, [adsr, filterCutoff, lastNoteEndSec, recorded, renderTailSec, waveform]);

  const accept = useCallback(() => {
    if (!renderedBlobRef.current) return;
    onMusicReady?.(renderedBlobRef.current, lastNoteEndSec + renderTailSec);
  }, [lastNoteEndSec, onMusicReady, renderTailSec]);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 text-xs">
      {/* Octave shifter + recording toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 mr-2">
          <Button
            type="button" size="sm" variant="outline"
            onClick={() => setStartOctave((o) => Math.max(MIN_OCTAVE, o - 1))}
            disabled={startOctave <= MIN_OCTAVE}
            title="Shift octave down"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span className="text-[10px] font-mono text-muted-foreground px-1">
            C{startOctave}–C{startOctave + VISIBLE_OCTAVES}
          </span>
          <Button
            type="button" size="sm" variant="outline"
            onClick={() => setStartOctave((o) => Math.min(MAX_OCTAVE, o + 1))}
            disabled={startOctave >= MAX_OCTAVE}
            title="Shift octave up"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>

        {!isRecording ? (
          <Button type="button" size="sm" variant="default" onClick={startRecording}>
            <Mic className="h-3 w-3 mr-1.5" /> Record
          </Button>
        ) : (
          <Button type="button" size="sm" variant="destructive" onClick={stopRecording}>
            <Square className="h-3 w-3 mr-1.5" /> Stop
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" disabled={recorded.length === 0 || isRecording} onClick={clearRecording}>
          <Trash2 className="h-3 w-3 mr-1.5" /> Clear
        </Button>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {recorded.length} note{recorded.length === 1 ? "" : "s"}
          {lastNoteEndSec > 0 ? ` · ${lastNoteEndSec.toFixed(1)}s` : ""}
        </span>
      </div>

      {/* Keyboard. White keys flow horizontally; black keys are absolutely
          positioned over the gap between adjacent whites. */}
      <Keyboard
        keys={keys}
        activeNotes={activeNotes}
        onNoteOn={noteOn}
        onNoteOff={noteOff}
      />

      <p className="text-[10px] text-muted-foreground">
        Click + hold to play. Computer keys for the C{hotkeyOctave} octave:
        <span className="font-mono mx-1 px-1 bg-muted rounded">a s d f g h j</span> (white)
        <span className="font-mono mx-1 px-1 bg-muted rounded">w e t y u</span> (black).
        Use the arrows to shift octaves.
      </p>

      {/* Timbre + envelope (shared with OriginalMusicComposer) */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t">
        <WaveformPicker label="Waveform" value={waveform} onChange={(w) => { setWaveform(w); invalidateRender(); }} />
        <div>
          <Label className="text-[11px] mb-1 block">Master low-pass cutoff: {filterCutoff} Hz</Label>
          <Slider value={[filterCutoff]} min={200} max={20000} step={50} onValueChange={([v]) => { setFilterCutoff(v); invalidateRender(); }} />
        </div>
      </div>
      <div className="pt-2 border-t">
        <AdsrControls value={adsr} onChange={(next) => { setAdsr(next); invalidateRender(); }} />
      </div>

      {/* Render / preview / accept */}
      <div className="pt-2 border-t flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Label className="text-[10px]">Tail: {renderTailSec.toFixed(1)}s</Label>
          <Slider className="w-24" value={[renderTailSec]} min={0} max={5} step={0.1} onValueChange={([v]) => { setRenderTailSec(v); invalidateRender(); }} />
        </div>
        <Button type="button" size="sm" onClick={renderWav} disabled={isRendering || recorded.length === 0} variant={renderedUrl ? "outline" : "default"}>
          {isRendering ? <><Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Rendering…</> : renderedUrl ? "Re-render" : <><Play className="h-3 w-3 mr-1.5" /> Render WAV</>}
        </Button>
        {renderedUrl && (
          <>
            <audio src={renderedUrl} controls className="h-8 flex-1 min-w-0" />
            <Button type="button" size="sm" variant="outline" asChild>
              <a href={renderedUrl} download={`piano-take-${Date.now()}.wav`}>
                <Download className="h-3 w-3 mr-1.5" /> Save
              </a>
            </Button>
            {onMusicReady && (
              <Button type="button" size="sm" onClick={accept}>
                <CheckCircle2 className="h-3 w-3 mr-1.5" /> Use as music
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Keyboard renderer ──────────────────────────────────────────────────────
//
// Naturals laid out left-to-right; sharps absolute-positioned over the
// boundary between adjacent naturals. The sharp index is the count of
// naturals that came before it within the visible range, which lets us
// position via `left: (n + 1) * KEY_W - SHARP_W/2`.

const WHITE_W = 36; // px
const WHITE_H = 144;
const BLACK_W = 24;
const BLACK_H = 90;

function Keyboard({
  keys, activeNotes, onNoteOn, onNoteOff,
}: {
  keys: KeyDef[];
  activeNotes: Set<string>;
  onNoteOn: (k: KeyDef) => void;
  onNoteOff: (k: KeyDef) => void;
}) {
  const naturals = keys.filter((k) => k.natural);
  const sharps = keys.filter((k) => !k.natural);

  // Map each sharp to the index of the natural it sits AFTER (within
  // the visible naturals list). E.g. C# sits after C — find C's index
  // in `naturals` and position the sharp at (idx + 1) * WHITE_W.
  function naturalIndexBefore(sharpId: string): number {
    // sharpId like "C#4" or "F#5"
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

// One key — handles its own pointer + touch lifecycle so the parent
// doesn't leak listener spaghetti. `noteOff` always fires on
// pointerup OR pointerleave so a drag-off-the-key doesn't leave a
// stuck note.
function PianoKey({
  keyDef, active, onDown, onUp, className, style, labelClass,
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
