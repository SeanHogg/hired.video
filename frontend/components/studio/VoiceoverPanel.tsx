"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Volume2,
  Play,
  Pause,
  Loader2,
  Mic,
  RefreshCw,
  Zap,
  Square,
  Cpu,
  Upload,
} from "lucide-react";
import type { TTSVoice, WordTimestamp } from "@/lib/services/studio-features-service";
import { estimateWordTimestamps } from "@/lib/services/browser-tts";
import {
  TTS_ENGINES,
  type TtsEngineId,
  getEngineVoices,
  speakWithEngine,
  stopEngine,
  getEngineUnavailableReason,
  isWebGPUAvailable,
  renderToPcm,
  pcmToWav,
} from "@/lib/services/tts-engines";
import { studioService } from "@/lib/services/studio-service";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Scene {
  id: string;
  title?: string;
  text?: string;
  items?: string[];
  skills?: string[];
}

interface VoiceoverResult {
  sceneId: string;
  audioUrl: string | null;
  durationMs: number;
  wordTimestamps: WordTimestamp[];
}

interface Props {
  scenes: Scene[];
  projectId?: string;
  onVoiceoverGenerated?: (results: VoiceoverResult[]) => void;
  /** Fires whenever the user changes the engine, voice, or speed, so the
   *  parent can keep the global voiceover config (used by VideoPreview) in
   *  sync. */
  onVoiceConfigChange?: (config: {
    engine: TtsEngineId;
    voiceId: string;
    voiceName: string;
    speed: number;
  }) => void;
  /** Fires when the user edits a scene's narration text. */
  onSceneTextChange?: (sceneId: string, text: string) => void;
  /** Fires when the user publishes a rendered voiceover to a scene. The
   *  parent should attach this as an audio element on the matching scene. */
  onPublishToScene?: (sceneId: string, audioUrl: string, durationMs: number, label: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the narration text for a scene from its available fields. */
function buildSceneText(scene: Scene): string {
  const parts: string[] = [];
  if (scene.text) parts.push(scene.text);
  if (scene.items?.length) parts.push(scene.items.join(". "));
  if (scene.skills?.length) parts.push(`Skills: ${scene.skills.join(", ")}.`);
  return parts.join(" ").trim();
}

/**
 * Single entry point for user-facing speech playback. Wraps speakWithEngine
 * so every call site automatically surfaces synthesis failures as a toast.
 * Per the DRY rule: every place that plays voice goes through this helper —
 * never call speakWithEngine directly from the component.
 */
async function speakWithToast(
  engine: TtsEngineId,
  opts: Parameters<typeof speakWithEngine>[1],
): Promise<() => void> {
  return speakWithEngine(engine, {
    ...opts,
    onError: (msg) => {
      toast.error("Voice playback failed", { description: msg });
      opts.onError?.(msg);
    },
  });
}

/** Format milliseconds as mm:ss. */
function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VoiceoverPanel({
  scenes,
  projectId,
  onVoiceoverGenerated,
  onVoiceConfigChange,
  onSceneTextChange,
  onPublishToScene,
}: Props) {
  // --- Engine + voice selection state ---------------------------------------
  const [engine, setEngine] = useState<TtsEngineId>("web-speech");
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");

  // --- Generation state -----------------------------------------------------
  const [results, setResults] = useState<Map<string, VoiceoverResult>>(
    new Map(),
  );

  // --- Playback state -------------------------------------------------------
  const [playingSceneId, setPlayingSceneId] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const cancelSpeechRef = useRef<(() => void) | null>(null);

  // --- Publish state — sceneId currently being rendered+uploaded ------------
  const [publishingSceneId, setPublishingSceneId] = useState<string | null>(null);

  // --- Fetch voices whenever the engine changes ----------------------------
  useEffect(() => {
    let cancelled = false;
    async function loadVoices() {
      try {
        setVoicesLoading(true);
        setVoicesError(null);
        const data = await getEngineVoices(engine);
        if (cancelled) return;
        setVoices(data);
        // Reset to the first voice of the new engine. Don't preserve the
        // previous voiceId — it almost certainly won't exist on the new engine.
        setSelectedVoiceId(data[0]?.voice_id ?? "");
      } catch (err) {
        if (cancelled) return;
        setVoicesError(err instanceof Error ? err.message : "Failed to load voices");
      } finally {
        if (!cancelled) setVoicesLoading(false);
      }
    }
    loadVoices();
    return () => {
      cancelled = true;
    };
  }, [engine]);

  // --- Propagate voice + speed selection to parent --------------------------
  // Without this, VideoPreview keeps using the stale default voice no matter
  // what the user picks here. We stash the callback in a ref so the effect
  // only re-fires when the actual voice or speed changes — not whenever the
  // parent re-renders and produces a new callback identity.
  const voiceConfigCbRef = useRef(onVoiceConfigChange);
  useEffect(() => {
    voiceConfigCbRef.current = onVoiceConfigChange;
  }, [onVoiceConfigChange]);
  useEffect(() => {
    if (!selectedVoiceId || voices.length === 0) return;
    const voice = voices.find((v) => v.voice_id === selectedVoiceId);
    voiceConfigCbRef.current?.({
      engine,
      voiceId: selectedVoiceId,
      voiceName: voice?.name ?? "Default",
      speed: playbackSpeed,
    });
  }, [engine, selectedVoiceId, playbackSpeed, voices]);

  // --- Cleanup speech on unmount --------------------------------------------
  useEffect(() => {
    return () => {
      stopEngine();
      cancelSpeechRef.current = null;
    };
  }, []);

  // --- Playback helpers -----------------------------------------------------

  const stopPlayback = useCallback(() => {
    stopEngine();
    cancelSpeechRef.current = null;
    setPlayingSceneId(null);
    setActiveWordIndex(-1);
  }, []);

  const playScene = useCallback(
    async (sceneId: string) => {
      const scene = scenes.find((s) => s.id === sceneId);
      const text = scene ? buildSceneText(scene) : "";
      if (!text) return;

      // If already playing this scene, stop it
      if (playingSceneId === sceneId) {
        stopPlayback();
        return;
      }

      stopPlayback();
      setPlayingSceneId(sceneId);
      setActiveWordIndex(-1);

      // speakWithEngine is async (engines lazy-load on first use). Capture
      // the cancel function as soon as it's available so a stop request that
      // arrives mid-load still works.
      try {
        const cancel = await speakWithToast(engine, {
          text,
          voiceId: selectedVoiceId,
          speed: playbackSpeed,
          onBoundary: (wordIndex) => setActiveWordIndex(wordIndex),
          onEnd: () => {
            setPlayingSceneId(null);
            setActiveWordIndex(-1);
            cancelSpeechRef.current = null;
          },
          onError: () => {
            setPlayingSceneId(null);
            setActiveWordIndex(-1);
            cancelSpeechRef.current = null;
          },
        });
        cancelSpeechRef.current = cancel;
      } catch (err) {
        setPlayingSceneId(null);
        setActiveWordIndex(-1);
        const msg = err instanceof Error ? err.message : "Playback failed";
        toast.error("Voice playback failed", { description: msg });
      }
    },
    [engine, playingSceneId, playbackSpeed, scenes, selectedVoiceId, stopPlayback],
  );

  // --- Generation handlers --------------------------------------------------
  // "Generate" now just estimates word timestamps instantly — no API call.

  const generateForScene = useCallback(
    (scene: Scene) => {
      const text = buildSceneText(scene);
      if (!text) return;

      const { timestamps, durationMs } = estimateWordTimestamps(
        text,
        playbackSpeed,
      );

      const voiceoverResult: VoiceoverResult = {
        sceneId: scene.id,
        audioUrl: null, // browser TTS plays directly, no file URL
        durationMs,
        wordTimestamps: timestamps,
      };

      setResults((prev) => {
        const next = new Map(prev);
        next.set(scene.id, voiceoverResult);
        return next;
      });

      onVoiceoverGenerated?.([voiceoverResult]);
    },
    [playbackSpeed, onVoiceoverGenerated],
  );

  // Render TTS to a wav file, upload it, and notify the parent so it can
  // attach the result as an audio element on the scene. Browser TTS can't be
  // rendered to a file — only WebGPU engines (Kokoro / Piper / VibeVoice).
  const publishToScene = useCallback(
    async (scene: Scene) => {
      if (!onPublishToScene) return;
      const text = buildSceneText(scene);
      if (!text || !selectedVoiceId) return;
      if (engine === "web-speech") {
        toast.error("Switch to Kokoro or Piper to publish a voiceover file.");
        return;
      }
      setPublishingSceneId(scene.id);
      try {
        const { pcm, sampleRate } = await renderToPcm(engine, text, selectedVoiceId, playbackSpeed);
        const wavBlob = pcmToWav(pcm, sampleRate);
        const file = new File([wavBlob], `voiceover-${scene.id}.wav`, { type: "audio/wav" });
        const uploadRes = await studioService.uploadSceneAudio(file);
        const audioUrl = uploadRes.data.url;
        const durationMs = Math.round((pcm.length / sampleRate) * 1000);
        const voice = voices.find((v) => v.voice_id === selectedVoiceId);
        const label = `Voiceover · ${voice?.name ?? "TTS"}`;
        onPublishToScene(scene.id, audioUrl, durationMs, label);
        toast.success("Voiceover published to scene");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Publish failed";
        toast.error("Couldn't publish voiceover", { description: msg });
      } finally {
        setPublishingSceneId(null);
      }
    },
    [engine, selectedVoiceId, playbackSpeed, voices, onPublishToScene],
  );

  const generateForAll = useCallback(() => {
    const allResults: VoiceoverResult[] = [];
    const newResults = new Map(results);

    for (const scene of scenes) {
      const text = buildSceneText(scene);
      if (!text) continue;

      const { timestamps, durationMs } = estimateWordTimestamps(
        text,
        playbackSpeed,
      );

      const voiceoverResult: VoiceoverResult = {
        sceneId: scene.id,
        audioUrl: null,
        durationMs,
        wordTimestamps: timestamps,
      };

      newResults.set(scene.id, voiceoverResult);
      allResults.push(voiceoverResult);
    }

    setResults(newResults);
    if (allResults.length > 0) {
      onVoiceoverGenerated?.(allResults);
    }
  }, [scenes, playbackSpeed, results, onVoiceoverGenerated]);

  // --- Derived values -------------------------------------------------------
  const totalDurationMs = Array.from(results.values()).reduce(
    (sum, r) => sum + r.durationMs,
    0,
  );

  // --- Render ---------------------------------------------------------------

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mic className="h-5 w-5" />
            Voiceover
          </CardTitle>
          {results.size > 0 && (
            <Badge variant="secondary" className="text-xs">
              {results.size}/{scenes.length} scenes &middot;{" "}
              {formatDuration(totalDurationMs)}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── Engine selector ────────────────────────────────────────── */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5" />
            Engine
          </label>
          <Select value={engine} onValueChange={(v) => setEngine(v as TtsEngineId)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TTS_ENGINES.map((eng) => {
                const unavailableReason = getEngineUnavailableReason(eng.id);
                return (
                  <SelectItem
                    key={eng.id}
                    value={eng.id}
                    disabled={unavailableReason !== null}
                  >
                    <span className="flex items-center gap-2">
                      <span>{eng.label}</span>
                      {eng.modelSizeMb > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          ~{eng.modelSizeMb}MB
                        </Badge>
                      )}
                      {unavailableReason && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {unavailableReason}
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {TTS_ENGINES.find((e) => e.id === engine)?.description}
            {engine !== "web-speech" && !isWebGPUAvailable() && (
              <span className="block text-destructive">
                WebGPU not available — falling back to Browser engine.
              </span>
            )}
          </p>
        </div>

        {/* ── Voice selector ─────────────────────────────────────────── */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Voice
          </label>

          {voicesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading voices...
            </div>
          ) : voicesError ? (
            <div className="flex items-center gap-2">
              <p className="text-sm text-destructive">{voicesError}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setVoicesError(null);
                  setVoicesLoading(true);
                  getEngineVoices(engine)
                    .then((data) => {
                      setVoices(data);
                      setSelectedVoiceId(data[0]?.voice_id ?? "");
                    })
                    .catch((e) =>
                      setVoicesError(
                        e instanceof Error ? e.message : "Failed to load voices",
                      ),
                    )
                    .finally(() => setVoicesLoading(false));
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Select value={selectedVoiceId} onValueChange={setSelectedVoiceId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a voice" />
              </SelectTrigger>
              <SelectContent>
                {voices.map((voice) => (
                  <SelectItem key={voice.voice_id} value={voice.voice_id}>
                    <span className="flex items-center gap-2">
                      <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span>{voice.name}</span>
                      {voice.category && (
                        <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">
                          {voice.category}
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Voice preview — speaks a sample sentence with the chosen engine */}
          {selectedVoiceId && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => {
                stopEngine();
                speakWithToast(engine, {
                  text: "Hi! This is a quick preview of how I sound.",
                  voiceId: selectedVoiceId,
                  speed: 1,
                }).catch((err) => {
                  toast.error("Voice preview failed", {
                    description: err instanceof Error ? err.message : String(err),
                  });
                });
              }}
            >
              <Play className="mr-1 h-3 w-3" />
              Preview voice
            </Button>
          )}
        </div>

        {/* ── Playback speed slider ──────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">
              Speed
            </label>
            <span className="text-sm font-mono tabular-nums text-muted-foreground">
              {playbackSpeed.toFixed(1)}x
            </span>
          </div>
          <Slider
            value={[playbackSpeed]}
            onValueChange={([val]) => setPlaybackSpeed(val)}
            min={0.5}
            max={2.0}
            step={0.1}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0.5x</span>
            <span>1.0x</span>
            <span>1.5x</span>
            <span>2.0x</span>
          </div>
        </div>

        {/* ── Generate all button ────────────────────────────────────── */}
        <Button
          className="w-full"
          onClick={generateForAll}
          disabled={!selectedVoiceId || scenes.length === 0}
        >
          <Zap className="mr-2 h-4 w-4" />
          Generate All Voiceovers
        </Button>

        {/* ── Scene list ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          {scenes.map((scene, index) => {
            const text = buildSceneText(scene);
            const result = results.get(scene.id);
            const isThisPlaying = playingSceneId === scene.id;
            const hasTimestamps = !!result;

            return (
              <div
                key={scene.id}
                className="rounded-lg border bg-muted/30 p-3 space-y-2"
              >
                {/* Scene header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge
                      variant="outline"
                      className="shrink-0 text-xs tabular-nums"
                    >
                      {index + 1}
                    </Badge>
                    <span className="text-sm font-medium truncate">
                      {scene.title || `Scene ${index + 1}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {result && (
                      <span className="text-xs text-muted-foreground tabular-nums mr-1">
                        {formatDuration(result.durationMs)}
                      </span>
                    )}

                    {/* Play / Stop button — speaks text via browser TTS */}
                    {text && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => playScene(scene.id)}
                      >
                        {isThisPlaying ? (
                          <Square className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}

                    {/* Generate timestamps button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={!selectedVoiceId || !text}
                      onClick={() => generateForScene(scene)}
                    >
                      {hasTimestamps ? (
                        <RefreshCw className="h-3.5 w-3.5" />
                      ) : (
                        <Mic className="h-3.5 w-3.5" />
                      )}
                    </Button>

                    {/* Publish to scene — renders WAV, uploads, attaches as
                        an audio element on the scene. Hidden when the parent
                        doesn't supply a publish handler. */}
                    {onPublishToScene && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title={engine === "web-speech"
                          ? "Switch to Kokoro/Piper to publish a file"
                          : "Publish voiceover to scene as audio element"}
                        disabled={
                          !selectedVoiceId ||
                          !text ||
                          engine === "web-speech" ||
                          publishingSceneId === scene.id
                        }
                        onClick={() => publishToScene(scene)}
                      >
                        {publishingSceneId === scene.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Editable narration script */}
                <textarea
                  value={scene.text ?? text}
                  onChange={(e) => onSceneTextChange?.(scene.id, e.target.value)}
                  placeholder="Narration text for this scene…"
                  rows={2}
                  className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {!onSceneTextChange && !text && (
                  <p className="text-xs text-muted-foreground/60 italic">
                    No text content for this scene
                  </p>
                )}

                {/* Word timestamps / caption preview during playback */}
                {isThisPlaying &&
                  result?.wordTimestamps &&
                  result.wordTimestamps.length > 0 && (
                    <div className="flex flex-wrap gap-x-1 gap-y-0.5 pt-1">
                      {result.wordTimestamps.map((wt, wi) => (
                        <span
                          key={`${scene.id}-w-${wi}`}
                          className={`text-xs transition-colors duration-100 ${
                            wi === activeWordIndex
                              ? "text-primary font-semibold"
                              : wi < activeWordIndex
                                ? "text-foreground/70"
                                : "text-muted-foreground/50"
                          }`}
                        >
                          {wt.word}
                        </span>
                      ))}
                    </div>
                  )}
              </div>
            );
          })}

          {scenes.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No scenes available. Add scenes to generate voiceover.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
