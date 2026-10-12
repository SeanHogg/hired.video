/**
 * Studio Dubbing Panel (#1558) — translate the project's caption cues
 * to a target language, then re-synthesize them through the chosen TTS
 * engine (cloned-voice preferred). The output blob is appended to the
 * canvas as a new voiceover `AudioLayer` so the dub plays back alongside
 * the original timeline.
 *
 * Closes the Synthesia "140+ language dubbing with consistent voice"
 * gap. Translation is server-side via the platform LLM; voice synth is
 * client-side via the WebGPU TTS stack — no per-minute render bill.
 */
import { useEffect, useMemo, useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import {
  dubbingService,
  type DubbingLanguage,
  type DubbingCueOutput,
} from "@/lib/services/dubbing-service";
import {
  TTS_ENGINES,
  renderToPcm,
  pcmToWav,
  type TtsEngineId,
} from "@/lib/services/tts-engines";
import type {
  AudioLayer,
  CanvasState,
} from "@/lib/studio/editor-v2/canvas-state";
import { makeAudioLayer } from "@/lib/studio/editor-v2/canvas-state";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import UnsavedMediaAlert from "@/components/studio/UnsavedMediaAlert";
import { audioFileFromBlob, persistAudioBlob } from "@/lib/studio/media-persistence";

/** A baked dub whose upload failed — held in memory, never a blob: URL (#563). */
interface UnsavedDub {
  wav: Blob;
  durationSeconds: number;
  label: string;
  anchorSceneId: string | null;
}

export interface StudioDubbingPanelProps {
  state: CanvasState;
  /** Adds the dubbed track to the canvas. The panel synthesizes one
   *  long audio blob covering all translated cues, sequenced against
   *  their original timing. */
  onAddVoiceover: (layer: AudioLayer) => void;
}

type Phase = "idle" | "translating" | "synthesizing" | "done" | "error";

export default function StudioDubbingPanel({
  state,
  onAddVoiceover,
}: StudioDubbingPanelProps) {
  const sourceCues = useMemo(
    () => state.captions?.cues ?? [],
    [state.captions],
  );

  const [languages, setLanguages] = useState<DubbingLanguage[]>([]);
  const [targetLanguage, setTargetLanguage] = useState<string>("es");
  const [engine, setEngine] = useState<TtsEngineId>("web-speech");
  const [voiceId, setVoiceId] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DubbingCueOutput[] | null>(null);
  const { t } = useTranslation();
  const [unsaved, setUnsaved] = useState<UnsavedDub | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void dubbingService.listLanguages().then((list) => {
      if (!cancelled) setLanguages(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (sourceCues.length === 0) {
    return (
      <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
        Dubbing needs a caption track on the project. Open the Captions
        dialog and either auto-generate from your voiceover or paste the
        script first.
      </div>
    );
  }

  // Host the baked track first; only a durable URL becomes a voiceover layer.
  async function saveDub(dub: UnsavedDub) {
    setUploading(true);
    const result = await persistAudioBlob(dub.wav, dub.label);
    setUploading(false);
    if (!result.ok) {
      setUnsaved(dub);
      setPhase("error");
      return;
    }
    setUnsaved(null);
    onAddVoiceover(
      makeAudioLayer({
        id: `dub_${Math.random().toString(36).slice(2, 10)}`,
        kind: "voiceover",
        source: { kind: "custom", url: result.url },
        label: dub.label,
        durationSeconds: dub.durationSeconds,
        anchorSceneId: dub.anchorSceneId,
      }),
    );
    setPhase("done");
  }

  const run = async () => {
    setError(null);
    setUnsaved(null);
    setPreview(null);
    setProgress(0);
    setPhase("translating");
    try {
      const translated = await dubbingService.translate({
        targetLanguage,
        cues: sourceCues.map((c) => ({
          text: c.text,
          start: c.start,
          end: c.end,
        })),
      });
      setPreview(translated.cues);
      setPhase("synthesizing");

      // Synthesize one PCM segment per cue at a fixed sample rate, then
      // splice into a single Float32Array sized to the project's caption
      // timeline. Silence between cues preserves the original timing.
      // (Web Speech engines can't return raw PCM; for those we still
      // call the synth so the user hears the dub, but we skip the
      // baked-track export.)
      if (engine === "web-speech") {
        setError(
          "Web Speech is preview-only — pick Kokoro / Piper / VibeVoice to bake the dubbed track into the timeline.",
        );
        setPhase("error");
        return;
      }

      const sampleRate = 24000;
      const totalDuration = translated.cues.reduce(
        (max, c) => Math.max(max, c.end ?? 0),
        0,
      );
      const totalSamples = Math.ceil(totalDuration * sampleRate);
      const mixed = new Float32Array(totalSamples);

      for (let i = 0; i < translated.cues.length; i++) {
        const cue = translated.cues[i];
        setProgress((i / translated.cues.length) * 100);
        const { pcm } = await renderToPcm(
          engine,
          cue.text,
          voiceId,
          1,
        );
        const start = Math.floor((cue.start ?? 0) * sampleRate);
        for (let j = 0; j < pcm.length && start + j < mixed.length; j++) {
          mixed[start + j] = pcm[j];
        }
      }

      const wav = pcmToWav(mixed, sampleRate);
      setProgress(100);
      await saveDub({
        wav,
        durationSeconds: totalSamples / sampleRate,
        label: `Dubbed — ${translated.targetLabel}`,
        anchorSceneId: state.scenes[0]?.id ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dubbing failed");
      setPhase("error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Languages className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div>
          Translates {sourceCues.length} caption cue
          {sourceCues.length === 1 ? "" : "s"} into the target language,
          then synthesizes a dubbed audio track using the chosen TTS
          engine (cloned voice preferred). The dubbed track is appended
          to the timeline so it plays alongside the original.
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium">Target language</label>
        <select
          value={targetLanguage}
          onChange={(e) => setTargetLanguage(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          {languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label} ({l.code})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium">TTS engine</label>
        <select
          value={engine}
          onChange={(e) => setEngine(e.target.value as TtsEngineId)}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          {TTS_ENGINES.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Web Speech is preview-only. Pick Kokoro / Piper / VibeVoice to
          bake a dubbed audio track into the project.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium">Voice id (optional)</label>
        <input
          type="text"
          value={voiceId}
          placeholder="Cloned-voice id or engine voice"
          onChange={(e) => setVoiceId(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
        />
      </div>

      <Button
        size="sm"
        onClick={run}
        disabled={phase === "translating" || phase === "synthesizing"}
      >
        {(phase === "translating" || phase === "synthesizing") && (
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
        )}
        {phase === "translating"
          ? "Translating…"
          : phase === "synthesizing"
            ? `Synthesizing… ${Math.round(progress)}%`
            : "Dub"}
      </Button>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {unsaved && (
        <UnsavedMediaAlert
          blob={unsaved.wav}
          filename={audioFileFromBlob(unsaved.wav, unsaved.label).name}
          message={t("studio.unsavedMedia.audioNotSavedYet")}
          downloadLabel={t("studio.unsavedMedia.downloadTrack")}
          busy={uploading}
          onRetry={() => void saveDub(unsaved)}
          onDiscard={() => {
            setUnsaved(null);
            setPhase("idle");
          }}
        />
      )}

      {preview && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold">Translated cues</h4>
          <div className="max-h-64 overflow-y-auto rounded-md border bg-background">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1.5">Source</th>
                  <th className="text-left px-2 py-1.5">Translation</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((cue, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {cue.sourceText}
                    </td>
                    <td className="px-2 py-1.5">{cue.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
