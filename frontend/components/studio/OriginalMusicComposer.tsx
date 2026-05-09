// OriginalMusicComposer.tsx — minimal in-browser step sequencer that
// produces a WAV Blob the music lane can consume. Built with the
// native Web Audio API + OfflineAudioContext — no Tone.js, no extra
// deps, no server round-trip.
//
// Scope: 4 instrument lanes × 16 steps, adjustable BPM, adjustable
// total duration. The loop is rendered offline once, then offered to
// the parent as a Blob (and as a downloadable WAV).
//
// Out of scope (tracked in gap register #457 — full APEX synth port):
// envelopes, filter sweeps, multiple oscillator waveforms, MIDI input,
// sheet music, presets, polyphonic piano. The standalone APEX synth
// at C:\code\hired\synth has all of those — this component is the
// in-Studio quick-bed for promo videos, not the full music DAW.

import { useState, useRef, useCallback, useMemo } from "react";
import { Play, Square, Download, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const STEPS = 16;

interface Instrument {
  id: string;
  label: string;
  /** Render one hit into the offline context at time `t`. */
  render: (ctx: OfflineAudioContext, t: number) => void;
}

const INSTRUMENTS: Instrument[] = [
  {
    id: "kick",
    label: "Kick",
    render: (ctx, t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      gain.gain.setValueAtTime(1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    },
  },
  {
    id: "snare",
    label: "Snare",
    render: (ctx, t) => {
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
      src.connect(hp).connect(gain).connect(ctx.destination);
      src.start(t);
      src.stop(t + dur);
    },
  },
  {
    id: "hat",
    label: "Hi-hat",
    render: (ctx, t) => {
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
      src.connect(hp).connect(gain).connect(ctx.destination);
      src.start(t);
      src.stop(t + dur);
    },
  },
  {
    id: "bass",
    label: "Bass",
    render: (ctx, t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(80, t);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    },
  },
];

// Default 4-on-the-floor + simple snare backbeat — non-empty out of
// the box so users hear something on first render without clicking.
const DEFAULT_PATTERN: Record<string, boolean[]> = {
  kick: bool16([0, 4, 8, 12]),
  snare: bool16([4, 12]),
  hat: bool16([0, 2, 4, 6, 8, 10, 12, 14]),
  bass: bool16([0, 8]),
};

function bool16(active: number[]): boolean[] {
  return Array.from({ length: STEPS }, (_, i) => active.includes(i));
}

interface Props {
  /** Called when the user accepts the rendered loop — receives a WAV Blob. */
  onMusicReady?: (blob: Blob, durationSec: number) => void;
}

export default function OriginalMusicComposer({ onMusicReady }: Props) {
  const [pattern, setPattern] = useState<Record<string, boolean[]>>(DEFAULT_PATTERN);
  const [bpm, setBpm] = useState(120);
  const [durationSec, setDurationSec] = useState(30);
  const [isRendering, setIsRendering] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const renderedBlobRef = useRef<Blob | null>(null);

  const stepDur = useMemo(() => 60 / bpm / 4, [bpm]); // 16th note in seconds

  const toggleStep = useCallback((instrId: string, step: number) => {
    setPattern((p) => {
      const next = { ...p, [instrId]: [...(p[instrId] ?? new Array(STEPS).fill(false))] };
      next[instrId][step] = !next[instrId][step];
      return next;
    });
    // Editing invalidates the previously-rendered loop.
    if (renderedUrl) {
      URL.revokeObjectURL(renderedUrl);
      setRenderedUrl(null);
      renderedBlobRef.current = null;
    }
  }, [renderedUrl]);

  const render = useCallback(async () => {
    setIsRendering(true);
    try {
      const sampleRate = 44100;
      const ctx = new OfflineAudioContext(2, Math.ceil(durationSec * sampleRate), sampleRate);
      const loopDur = STEPS * stepDur;
      const loops = Math.ceil(durationSec / loopDur);

      for (let loop = 0; loop < loops; loop++) {
        for (let step = 0; step < STEPS; step++) {
          const t = loop * loopDur + step * stepDur;
          if (t >= durationSec) break;
          for (const inst of INSTRUMENTS) {
            if (pattern[inst.id]?.[step]) inst.render(ctx, t);
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
  }, [bpm, durationSec, pattern, stepDur]);

  const accept = useCallback(() => {
    if (!renderedBlobRef.current) return;
    onMusicReady?.(renderedBlobRef.current, durationSec);
  }, [durationSec, onMusicReady]);

  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-[80px_1fr] gap-y-1.5 items-center">
        {INSTRUMENTS.map((inst) => (
          <FragmentRow key={inst.id} label={inst.label}>
            {Array.from({ length: STEPS }, (_, step) => {
              const on = pattern[inst.id]?.[step] ?? false;
              const isDownbeat = step % 4 === 0;
              return (
                <button
                  key={step}
                  type="button"
                  aria-label={`${inst.label} step ${step + 1}`}
                  aria-pressed={on}
                  onClick={() => toggleStep(inst.id, step)}
                  className={cn(
                    "w-6 h-6 rounded-sm border transition-colors",
                    on
                      ? "bg-primary border-primary"
                      : isDownbeat
                        ? "bg-muted/60 border-border hover:bg-muted"
                        : "bg-background border-border hover:bg-muted",
                  )}
                />
              );
            })}
          </FragmentRow>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t">
        <div>
          <Label className="text-[11px] mb-1 block">BPM: {bpm}</Label>
          <Slider value={[bpm]} min={60} max={180} step={1} onValueChange={([v]) => setBpm(v)} />
        </div>
        <div>
          <Label className="text-[11px] mb-1 block">Length: {durationSec}s</Label>
          <Slider value={[durationSec]} min={5} max={60} step={1} onValueChange={([v]) => setDurationSec(v)} />
        </div>
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

// Two-cell row inside the parent grid — one label, one strip of step
// cells. Pulled out so the grid template stays in one place.
function FragmentRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="text-[11px] font-medium text-muted-foreground pr-2">{label}</div>
      <div className="flex gap-1">{children}</div>
    </>
  );
}

// ── WAV encoder (16-bit PCM) ────────────────────────────────────────────────
// Inlined to keep the composer dep-free. Standard Microsoft WAVE-PCM
// header followed by interleaved Int16 samples per the RIFF spec.
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numCh * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataLen = buffer.length * blockAlign;
  const out = new ArrayBuffer(44 + dataLen);
  const view = new DataView(out);

  let p = 0;
  function writeStr(s: string) { for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i)); }
  function u32(v: number) { view.setUint32(p, v, true); p += 4; }
  function u16(v: number) { view.setUint16(p, v, true); p += 2; }

  writeStr("RIFF");
  u32(36 + dataLen);
  writeStr("WAVE");
  writeStr("fmt ");
  u32(16);            // fmt chunk size
  u16(1);             // PCM
  u16(numCh);
  u32(sampleRate);
  u32(byteRate);
  u16(blockAlign);
  u16(bitDepth);
  writeStr("data");
  u32(dataLen);

  // Interleave channels and clamp to int16 range.
  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      p += 2;
    }
  }
  return out;
}
