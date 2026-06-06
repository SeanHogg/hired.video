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
import { Mic, Square, Play, Trash2, Loader2, Download, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { audioBufferToWav } from "@/lib/audio/wav";
import {
  renderPlayedNotesToBuffer,
  DEFAULT_ADSR,
  type ADSR,
  type Waveform,
  type PlayedNote,
} from "@/lib/audio/synth-engine";
import { WaveformPicker } from "./WaveformPicker";
import { AdsrControls } from "./AdsrControls";
import {
  Keyboard,
  OctaveShifter,
  buildKeys,
  useComputerKeyboard,
  type KeyDef,
} from "./Keyboard";

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

  // ── Computer-keyboard handling (shared hook) ──────────────────────────
  useComputerKeyboard(keys, noteOn, noteOff);

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
        <div className="mr-2">
          <OctaveShifter startOctave={startOctave} onChange={setStartOctave} />
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
