// SynthComposer.tsx — the full Studio synthesiser: the "piano + music
// controls + whole sound mixer" surface ported from C:\code\hired\synth
// (the APEX synth), closing the mixer half of gap #457.
//
// Layout: a multi-oscillator stack, a serial filter rack, a serial
// effect rack, master + envelope — all driving the shared playable
// Keyboard. Play live (Tone.js LiveSynth), record what you play, bounce
// it offline to a WAV through the SAME patch, and hand the blob to the
// music lane via onMusicReady (identical contract to PianoComposer /
// OriginalMusicComposer, so ActionsPanel doesn't care which surface
// produced the track). Patches save/load as JSON presets.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  Square,
  Play,
  Trash2,
  Loader2,
  Download,
  CheckCircle2,
  Save,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import type { PlayedNote } from "@/lib/audio/synth-engine";
import { makeDefaultPatch, type SynthPatch } from "@/lib/audio/synth-patch";
import { LiveSynth, renderPatchToWavBlob } from "@/lib/audio/synth-graph";
import {
  downloadSynthPreset,
  parseSynthPresetFile,
  serializeSynthPreset,
} from "@/lib/audio/synth-preset";
import {
  Keyboard,
  OctaveShifter,
  buildKeys,
  useComputerKeyboard,
  type KeyDef,
} from "./Keyboard";
import { OscillatorRack } from "./synth/OscillatorRack";
import { FilterRack } from "./synth/FilterRack";
import { EffectRack } from "./synth/EffectRack";
import { MasterControls } from "./synth/MasterControls";

interface Props {
  onMusicReady?: (blob: Blob, durationSec: number) => void;
}

interface RecordEntry {
  startSec: number;
  startPerf: number;
}

export default function SynthComposer({ onMusicReady }: Props) {
  const { toast } = useToast();

  const [patch, setPatch] = useState<SynthPatch>(() => makeDefaultPatch());
  const [presetName, setPresetName] = useState("My patch");

  // ── Keyboard view ──────────────────────────────────────────────────────
  const [startOctave, setStartOctave] = useState(3);
  const hotkeyOctave = startOctave + 1;
  const keys = useMemo(() => buildKeys(startOctave, hotkeyOctave), [startOctave, hotkeyOctave]);
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());

  // ── Live engine ────────────────────────────────────────────────────────
  const synthRef = useRef<LiveSynth | null>(null);
  useEffect(() => {
    const synth = new LiveSynth(makeDefaultPatch());
    synthRef.current = synth;
    return () => {
      synth.dispose();
      synthRef.current = null;
    };
  }, []);

  // ── Recording ──────────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const recordingStartRef = useRef<number | null>(null);
  const recordEntriesRef = useRef<Map<string, RecordEntry>>(new Map());
  const [recorded, setRecorded] = useState<PlayedNote[]>([]);

  // ── Render / preview ───────────────────────────────────────────────────
  const [isRendering, setIsRendering] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const renderedBlobRef = useRef<Blob | null>(null);
  const [renderTailSec, setRenderTailSec] = useState(2);

  const invalidateRender = useCallback(() => {
    setRenderedUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      renderedBlobRef.current = null;
      return null;
    });
  }, []);

  // Push patch edits into the live graph (ramps continuous params, only
  // rebuilds the chain on structural changes) + invalidate any bounce.
  useEffect(() => {
    synthRef.current?.setPatch(patch);
    invalidateRender();
  }, [patch, invalidateRender]);

  // ── Note on / off ──────────────────────────────────────────────────────
  const onNoteOn = useCallback(
    (key: KeyDef) => {
      const synth = synthRef.current;
      if (!synth) return;
      void synth.ensureStarted().then(() => synth.noteOn(key.freq));
      setActiveNotes((s) => new Set(s).add(key.noteId));
      if (isRecording && recordingStartRef.current !== null) {
        recordEntriesRef.current.set(key.noteId, {
          startSec: (performance.now() - recordingStartRef.current) / 1000,
          startPerf: performance.now(),
        });
      }
    },
    [isRecording],
  );

  const onNoteOff = useCallback((key: KeyDef) => {
    synthRef.current?.noteOff(key.freq);
    setActiveNotes((s) => {
      const next = new Set(s);
      next.delete(key.noteId);
      return next;
    });
    const entry = recordEntriesRef.current.get(key.noteId);
    if (entry) {
      recordEntriesRef.current.delete(key.noteId);
      const durationSec = Math.max(0.05, (performance.now() - entry.startPerf) / 1000);
      setRecorded((prev) => [...prev, { freq: key.freq, startSec: entry.startSec, durationSec }]);
      invalidateRender();
    }
  }, [invalidateRender]);

  useComputerKeyboard(keys, onNoteOn, onNoteOff);

  // ── Recording controls ─────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    setRecorded([]);
    recordEntriesRef.current.clear();
    invalidateRender();
    recordingStartRef.current = performance.now();
    setIsRecording(true);
  }, [invalidateRender]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    recordingStartRef.current = null;
    recordEntriesRef.current.clear();
  }, []);

  const clearRecording = useCallback(() => {
    setRecorded([]);
    invalidateRender();
  }, [invalidateRender]);

  const lastNoteEndSec = useMemo(() => {
    let m = 0;
    for (const n of recorded) m = Math.max(m, n.startSec + n.durationSec);
    return m;
  }, [recorded]);

  // ── Render to WAV (same patch, offline) ────────────────────────────────
  const renderWav = useCallback(async () => {
    if (recorded.length === 0) return;
    setIsRendering(true);
    try {
      const durationSec = lastNoteEndSec + renderTailSec;
      const blob = await renderPatchToWavBlob(patch, recorded, durationSec);
      renderedBlobRef.current = blob;
      setRenderedUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (err) {
      console.error("[SynthComposer] render failed", err);
      toast({ title: "Render failed", description: "Couldn't bounce the synth to audio.", variant: "destructive" });
    } finally {
      setIsRendering(false);
    }
  }, [lastNoteEndSec, patch, recorded, renderTailSec, toast]);

  const accept = useCallback(() => {
    if (!renderedBlobRef.current) return;
    onMusicReady?.(renderedBlobRef.current, lastNoteEndSec + renderTailSec);
  }, [lastNoteEndSec, onMusicReady, renderTailSec]);

  // ── Preset save / load ─────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const savePreset = useCallback(() => {
    downloadSynthPreset(serializeSynthPreset(presetName, patch));
  }, [patch, presetName]);

  const loadPreset = useCallback(
    async (file: File) => {
      try {
        const parsed = await parseSynthPresetFile(file);
        setPatch(parsed.patch);
        setPresetName(parsed.name);
        toast({ title: "Preset loaded", description: parsed.name });
      } catch (err) {
        toast({
          title: "Couldn't load preset",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  // Revoke any outstanding object URL on unmount.
  useEffect(() => () => {
    if (renderedBlobRef.current) renderedBlobRef.current = null;
  }, []);

  return (
    <div className="space-y-3 text-xs">
      {/* Preset bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          className="h-8 w-40 text-xs"
          placeholder="Patch name"
          aria-label="Patch name"
        />
        <Button type="button" size="sm" variant="outline" onClick={savePreset}>
          <Save className="h-3 w-3 mr-1.5" /> Save preset
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
          <FolderOpen className="h-3 w-3 mr-1.5" /> Load preset
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadPreset(file);
            e.target.value = ""; // allow re-loading the same file
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => setPatch(makeDefaultPatch())}
        >
          Reset
        </Button>
      </div>

      {/* Mixer racks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <OscillatorRack
          oscillators={patch.oscillators}
          onChange={(oscillators) => setPatch((p) => ({ ...p, oscillators }))}
        />
        <FilterRack
          filters={patch.filters}
          onChange={(filters) => setPatch((p) => ({ ...p, filters }))}
        />
        <div className="space-y-3">
          <EffectRack
            effects={patch.effects}
            onChange={(effects) => setPatch((p) => ({ ...p, effects }))}
          />
          <MasterControls
            master={patch.master}
            adsr={patch.adsr}
            onMasterChange={(master) => setPatch((p) => ({ ...p, master }))}
            onAdsrChange={(adsr) => setPatch((p) => ({ ...p, adsr }))}
          />
        </div>
      </div>

      {/* Keyboard toolbar */}
      <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
        <OctaveShifter startOctave={startOctave} onChange={setStartOctave} />
        {!isRecording ? (
          <Button type="button" size="sm" variant="default" onClick={startRecording}>
            <Mic className="h-3 w-3 mr-1.5" /> Record
          </Button>
        ) : (
          <Button type="button" size="sm" variant="destructive" onClick={stopRecording}>
            <Square className="h-3 w-3 mr-1.5" /> Stop
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={recorded.length === 0 || isRecording}
          onClick={clearRecording}
        >
          <Trash2 className="h-3 w-3 mr-1.5" /> Clear
        </Button>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {recorded.length} note{recorded.length === 1 ? "" : "s"}
          {lastNoteEndSec > 0 ? ` · ${lastNoteEndSec.toFixed(1)}s` : ""}
        </span>
      </div>

      <Keyboard keys={keys} activeNotes={activeNotes} onNoteOn={onNoteOn} onNoteOff={onNoteOff} />

      <p className="text-[10px] text-muted-foreground">
        Click + hold to play. Computer keys for the C{hotkeyOctave} octave:
        <span className="font-mono mx-1 px-1 bg-muted rounded">a s d f g h j</span> (white)
        <span className="font-mono mx-1 px-1 bg-muted rounded">w e t y u</span> (black).
        Arrows shift octaves.
      </p>

      {/* Render / preview / accept */}
      <div className="pt-2 border-t flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Label className="text-[10px]">Tail: {renderTailSec.toFixed(1)}s</Label>
          <Slider
            className="w-24"
            value={[renderTailSec]}
            min={0}
            max={5}
            step={0.1}
            onValueChange={([v]) => {
              setRenderTailSec(v);
              invalidateRender();
            }}
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={renderWav}
          disabled={isRendering || recorded.length === 0}
          variant={renderedUrl ? "outline" : "default"}
        >
          {isRendering ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Rendering…
            </>
          ) : renderedUrl ? (
            "Re-render"
          ) : (
            <>
              <Play className="h-3 w-3 mr-1.5" /> Render WAV
            </>
          )}
        </Button>
        {renderedUrl && (
          <>
            <audio src={renderedUrl} controls className="h-8 flex-1 min-w-0" />
            <Button type="button" size="sm" variant="outline" asChild>
              <a href={renderedUrl} download={`${presetName || "synth"}.wav`}>
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
