// OriginalMusicComposer.tsx — programmable step sequencer for in-Studio
// music beds. 5 lanes × 16 steps × adjustable BPM/duration → rendered
// offline via OfflineAudioContext to a 16-bit PCM WAV Blob.
//
// Pitched lanes (bass + melody) carry per-step C-major scale degrees
// (cycle on click, 1..8 = scale degree, 0 = off). Drum lanes use
// ad-hoc per-instrument synthesis (kick = pitch-sweep sine, snare =
// noise burst with hipass, hat = short noise burst). Master low-pass
// filter sits between all instruments and the destination.
//
// Shared with PianoComposer:
//  - ADSR / Waveform types + schedulePitchedNote (lib/audio/synth-engine)
//  - WAV encoder (lib/audio/wav)
//  - WaveformPicker, AdsrControls UI
//
// Still deferred to the full APEX synth port (gap #457): polyphonic
// piano (now partially landed in PianoComposer), ENV/LFO modulation,
// abcjs sheet-music render, JSON preset save/load, unison
// voices/detune/spread, multiple oscillator stacks per voice.

import { useState, useRef, useCallback, useMemo } from "react";
import { Play, Download, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { audioBufferToWav } from "@/lib/audio/wav";
import {
  schedulePitchedNote,
  DEFAULT_ADSR,
  type ADSR,
  type Waveform,
} from "@/lib/audio/synth-engine";
import { WaveformPicker } from "@/components/studio/music/WaveformPicker";
import { AdsrControls } from "@/components/studio/music/AdsrControls";

const STEPS = 16;

// C major one-octave scale (C4..C5). Indices 1..8 in patterns; 0 = off.
const SCALE_FREQS = [
  261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25,
];
const NOTE_LABELS = ["C", "D", "E", "F", "G", "A", "B", "C↑"];

interface RenderOpts {
  dest: AudioNode;
  waveformBass: Waveform;
  waveformMelody: Waveform;
  adsr: ADSR;
  stepDur: number;
}

interface Lane {
  id: string;
  label: string;
  pitched: boolean;
  render: (ctx: OfflineAudioContext, t: number, value: number, opts: RenderOpts) => void;
}

const LANES: Lane[] = [
  {
    id: "kick",
    label: "Kick",
    pitched: false,
    render: (ctx, t, _v, { dest }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      gain.gain.setValueAtTime(1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain).connect(dest);
      osc.start(t);
      osc.stop(t + 0.2);
    },
  },
  {
    id: "snare",
    label: "Snare",
    pitched: false,
    render: (ctx, t, _v, { dest }) => {
      const dur = 0.12;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1500;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.7, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(hp).connect(gain).connect(dest);
      src.start(t);
      src.stop(t + dur);
    },
  },
  {
    id: "hat",
    label: "Hi-hat",
    pitched: false,
    render: (ctx, t, _v, { dest }) => {
      const dur = 0.05;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(hp).connect(gain).connect(dest);
      src.start(t);
      src.stop(t + dur);
    },
  },
  {
    id: "bass",
    label: "Bass",
    pitched: true,
    render: (ctx, t, value, { dest, waveformBass, adsr, stepDur }) => {
      if (value < 1 || value > 8) return;
      const freq = SCALE_FREQS[value - 1] / 2;
      schedulePitchedNote(ctx, t, freq, waveformBass, 0.25, adsr, stepDur * 0.9, dest);
    },
  },
  {
    id: "melody",
    label: "Melody",
    pitched: true,
    render: (ctx, t, value, { dest, waveformMelody, adsr, stepDur }) => {
      if (value < 1 || value > 8) return;
      const freq = SCALE_FREQS[value - 1];
      schedulePitchedNote(ctx, t, freq, waveformMelody, 0.18, adsr, stepDur * 0.9, dest);
    },
  },
];

// Default 4-on-the-floor + simple snare backbeat — non-empty out of
// the box so users hear something on first render without clicking.
const DEFAULT_PATTERN: Record<string, number[]> = {
  kick:   pat([0, 4, 8, 12]),
  snare:  pat([4, 12]),
  hat:    pat([0, 2, 4, 6, 8, 10, 12, 14]),
  bass:   pitchedPat([[0, 1], [4, 5], [8, 1], [12, 5]]),
  melody: pitchedPat([[0, 5], [2, 7], [4, 8], [6, 7], [8, 5], [10, 3], [12, 1], [14, 3]]),
};

function pat(active: number[]): number[] {
  const arr = new Array(STEPS).fill(0);
  for (const i of active) arr[i] = 1;
  return arr;
}
function pitchedPat(notes: Array<[step: number, scaleDegree: number]>): number[] {
  const arr = new Array(STEPS).fill(0);
  for (const [s, d] of notes) arr[s] = d;
  return arr;
}

interface Props {
  onMusicReady?: (blob: Blob, durationSec: number) => void;
}

export default function OriginalMusicComposer({ onMusicReady }: Props) {
  const [pattern, setPattern] = useState<Record<string, number[]>>(DEFAULT_PATTERN);
  const [bpm, setBpm] = useState(120);
  const [durationSec, setDurationSec] = useState(30);
  const [waveformBass, setWaveformBass] = useState<Waveform>("triangle");
  const [waveformMelody, setWaveformMelody] = useState<Waveform>("square");
  const [adsr, setAdsr] = useState<ADSR>(DEFAULT_ADSR);
  const [filterCutoff, setFilterCutoff] = useState(8000);
  const [isRendering, setIsRendering] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const renderedBlobRef = useRef<Blob | null>(null);

  const stepDur = useMemo(() => 60 / bpm / 4, [bpm]); // 16th-note in seconds

  const invalidateRender = useCallback(() => {
    if (renderedUrl) {
      URL.revokeObjectURL(renderedUrl);
      setRenderedUrl(null);
      renderedBlobRef.current = null;
    }
  }, [renderedUrl]);

  const cycleStep = useCallback((laneId: string, step: number) => {
    setPattern((p) => {
      const lane = LANES.find((l) => l.id === laneId);
      const max = lane?.pitched ? 8 : 1;
      const next = { ...p, [laneId]: [...(p[laneId] ?? new Array(STEPS).fill(0))] };
      const cur = next[laneId][step];
      next[laneId][step] = cur >= max ? 0 : cur + 1;
      return next;
    });
    invalidateRender();
  }, [invalidateRender]);

  const render = useCallback(async () => {
    setIsRendering(true);
    try {
      const sampleRate = 44100;
      const ctx = new OfflineAudioContext(2, Math.ceil(durationSec * sampleRate), sampleRate);

      const masterFilter = ctx.createBiquadFilter();
      masterFilter.type = "lowpass";
      masterFilter.frequency.value = filterCutoff;
      masterFilter.Q.value = 0.7;
      masterFilter.connect(ctx.destination);

      const opts: RenderOpts = {
        dest: masterFilter,
        waveformBass,
        waveformMelody,
        adsr,
        stepDur,
      };

      const loopDur = STEPS * stepDur;
      const loops = Math.ceil(durationSec / loopDur);

      for (let loop = 0; loop < loops; loop++) {
        for (let step = 0; step < STEPS; step++) {
          const t = loop * loopDur + step * stepDur;
          if (t >= durationSec) break;
          for (const lane of LANES) {
            const value = pattern[lane.id]?.[step] ?? 0;
            if (value > 0) lane.render(ctx, t, value, opts);
          }
        }
      }

      const buf = await ctx.startRendering();
      const wav = audioBufferToWav(buf);
      const blob = new Blob([wav], { type: "audio/wav" });
      renderedBlobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setRenderedUrl(url);
    } finally {
      setIsRendering(false);
    }
  }, [adsr, bpm, durationSec, filterCutoff, pattern, stepDur, waveformBass, waveformMelody]);

  const accept = useCallback(() => {
    if (!renderedBlobRef.current) return;
    onMusicReady?.(renderedBlobRef.current, durationSec);
  }, [durationSec, onMusicReady]);

  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-[80px_1fr] gap-y-1.5 items-center">
        {LANES.map((lane) => (
          <FragmentRow key={lane.id} label={lane.label}>
            {Array.from({ length: STEPS }, (_, step) => {
              const v = pattern[lane.id]?.[step] ?? 0;
              const on = v > 0;
              const isDownbeat = step % 4 === 0;
              return (
                <button
                  key={step}
                  type="button"
                  aria-label={`${lane.label} step ${step + 1}${lane.pitched && on ? `: ${NOTE_LABELS[v - 1]}` : ""}`}
                  aria-pressed={on}
                  onClick={() => cycleStep(lane.id, step)}
                  className={cn(
                    "w-6 h-6 rounded-sm border transition-colors flex items-center justify-center text-[9px] font-semibold",
                    on
                      ? "bg-primary border-primary text-primary-foreground"
                      : isDownbeat
                        ? "bg-muted/60 border-border hover:bg-muted text-muted-foreground"
                        : "bg-background border-border hover:bg-muted text-muted-foreground",
                  )}
                >
                  {lane.pitched && on ? NOTE_LABELS[v - 1] : ""}
                </button>
              );
            })}
          </FragmentRow>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground -mt-2">
        Drum lanes: click to toggle. Bass + Melody: click to cycle through C-major scale notes.
      </p>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t">
        <div>
          <Label className="text-[11px] mb-1 block">BPM: {bpm}</Label>
          <Slider value={[bpm]} min={60} max={180} step={1} onValueChange={([v]) => { setBpm(v); invalidateRender(); }} />
        </div>
        <div>
          <Label className="text-[11px] mb-1 block">Length: {durationSec}s</Label>
          <Slider value={[durationSec]} min={5} max={60} step={1} onValueChange={([v]) => { setDurationSec(v); invalidateRender(); }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t">
        <WaveformPicker label="Bass waveform" value={waveformBass} onChange={(w) => { setWaveformBass(w); invalidateRender(); }} />
        <WaveformPicker label="Melody waveform" value={waveformMelody} onChange={(w) => { setWaveformMelody(w); invalidateRender(); }} />
      </div>

      <div className="pt-2 border-t">
        <AdsrControls
          heading="Envelope (bass + melody)"
          value={adsr}
          onChange={(next) => { setAdsr(next); invalidateRender(); }}
        />
      </div>

      <div className="pt-2 border-t">
        <Label className="text-[11px] mb-1 block">Master low-pass cutoff: {filterCutoff} Hz</Label>
        <Slider value={[filterCutoff]} min={200} max={20000} step={50} onValueChange={([v]) => { setFilterCutoff(v); invalidateRender(); }} />
      </div>

      <div className="flex items-center gap-2 pt-2 border-t">
        <Button type="button" size="sm" onClick={render} disabled={isRendering} variant={renderedUrl ? "outline" : "default"}>
          {isRendering ? <><Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Rendering…</> : renderedUrl ? "Re-render" : <><Play className="h-3 w-3 mr-1.5" /> Render WAV</>}
        </Button>
        {renderedUrl && (
          <>
            <audio src={renderedUrl} controls className="h-8 flex-1 min-w-0" />
            <Button type="button" size="sm" variant="outline" asChild>
              <a href={renderedUrl} download={`promo-music-${bpm}bpm.wav`}>
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

function FragmentRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="text-[11px] font-medium text-muted-foreground pr-2">{label}</div>
      <div className="flex gap-1">{children}</div>
    </>
  );
}
