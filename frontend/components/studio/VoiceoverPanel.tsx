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
} from "lucide-react";
import {
  getTTSVoices,
  generateTTS,
  generateTTSAll,
  type TTSVoice,
  type WordTimestamp,
} from "@/lib/services/studio-features-service";

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
}: Props) {
  // --- Voice selection state ------------------------------------------------
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");

  // --- Generation state -----------------------------------------------------
  const [results, setResults] = useState<Map<string, VoiceoverResult>>(
    new Map(),
  );
  const [generatingSceneId, setGeneratingSceneId] = useState<string | null>(
    null,
  );
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // --- Playback state -------------------------------------------------------
  const [playingSceneId, setPlayingSceneId] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number>(0);

  // --- Fetch voices on mount ------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadVoices() {
      try {
        setVoicesLoading(true);
        setVoicesError(null);
        const data = await getTTSVoices();
        if (cancelled) return;
        setVoices(data);
        if (data.length > 0) {
          setSelectedVoiceId(data[0].voice_id);
        }
      } catch (err) {
        if (cancelled) return;
        setVoicesError(
          err instanceof Error ? err.message : "Failed to load voices",
        );
      } finally {
        if (!cancelled) setVoicesLoading(false);
      }
    }

    loadVoices();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Cleanup audio on unmount ---------------------------------------------
  useEffect(() => {
    return () => {
      stopPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Audio playback helpers -----------------------------------------------

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }
    setPlayingSceneId(null);
    setPlaybackProgress(0);
    setActiveWordIndex(-1);
  }, []);

  const updatePlaybackState = useCallback(
    (sceneId: string) => {
      const audio = audioRef.current;
      if (!audio || audio.paused) return;

      const currentTimeMs = audio.currentTime * 1000;
      const durationMs = (audio.duration || 1) * 1000;
      setPlaybackProgress((currentTimeMs / durationMs) * 100);

      // Find active word for caption highlight
      const result = results.get(sceneId);
      if (result?.wordTimestamps.length) {
        const idx = result.wordTimestamps.findIndex(
          (w) => currentTimeMs >= w.start && currentTimeMs < w.end,
        );
        setActiveWordIndex(idx);
      }

      animationFrameRef.current = requestAnimationFrame(() =>
        updatePlaybackState(sceneId),
      );
    },
    [results],
  );

  const playScene = useCallback(
    (sceneId: string) => {
      const result = results.get(sceneId);
      if (!result?.audioUrl) return;

      // If already playing this scene, toggle pause/resume
      if (playingSceneId === sceneId && audioRef.current) {
        if (audioRef.current.paused) {
          audioRef.current.play();
          animationFrameRef.current = requestAnimationFrame(() =>
            updatePlaybackState(sceneId),
          );
        } else {
          audioRef.current.pause();
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = 0;
          }
        }
        return;
      }

      // Stop any current playback first
      stopPlayback();

      const audio = new Audio(result.audioUrl);
      audio.playbackRate = playbackSpeed;
      audioRef.current = audio;
      setPlayingSceneId(sceneId);

      audio.addEventListener("ended", () => {
        stopPlayback();
      });

      audio.addEventListener("error", () => {
        stopPlayback();
      });

      audio.play().then(() => {
        animationFrameRef.current = requestAnimationFrame(() =>
          updatePlaybackState(sceneId),
        );
      });
    },
    [playingSceneId, playbackSpeed, results, stopPlayback, updatePlaybackState],
  );

  // Update playback rate when speed changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // --- Generation handlers --------------------------------------------------

  const generateForScene = useCallback(
    async (scene: Scene) => {
      const text = buildSceneText(scene);
      if (!text) return;

      try {
        setGeneratingSceneId(scene.id);
        setGenerationError(null);

        const ttsResult = await generateTTS({
          text,
          voiceId: selectedVoiceId || undefined,
          projectId,
          sceneId: scene.id,
          speed: playbackSpeed,
        });

        const voiceoverResult: VoiceoverResult = {
          sceneId: scene.id,
          audioUrl: ttsResult.audioUrl,
          durationMs: ttsResult.durationMs,
          wordTimestamps: ttsResult.wordTimestamps,
        };

        setResults((prev) => {
          const next = new Map(prev);
          next.set(scene.id, voiceoverResult);
          return next;
        });

        onVoiceoverGenerated?.([voiceoverResult]);
      } catch (err) {
        setGenerationError(
          err instanceof Error
            ? err.message
            : "Failed to generate voiceover",
        );
      } finally {
        setGeneratingSceneId(null);
      }
    },
    [selectedVoiceId, projectId, playbackSpeed, onVoiceoverGenerated],
  );

  const generateForAll = useCallback(async () => {
    const scenesWithText = scenes
      .map((s) => ({ sceneId: s.id, text: buildSceneText(s) }))
      .filter((s) => s.text.length > 0);

    if (scenesWithText.length === 0) return;

    try {
      setGeneratingAll(true);
      setGenerationError(null);
      setGenerationProgress(0);

      const ttsAllResult = await generateTTSAll({
        scenes: scenesWithText,
        voiceId: selectedVoiceId || undefined,
        projectId,
        speed: playbackSpeed,
      });

      const newResults = new Map(results);
      const allResults: VoiceoverResult[] = [];

      ttsAllResult.results.forEach((r, idx) => {
        const voiceoverResult: VoiceoverResult = {
          sceneId: r.sceneId,
          audioUrl: r.audioUrl,
          durationMs: r.durationMs,
          wordTimestamps: r.wordTimestamps,
        };
        newResults.set(r.sceneId, voiceoverResult);
        allResults.push(voiceoverResult);
        setGenerationProgress(
          Math.round(((idx + 1) / ttsAllResult.results.length) * 100),
        );
      });

      setResults(newResults);
      onVoiceoverGenerated?.(allResults);
    } catch (err) {
      setGenerationError(
        err instanceof Error
          ? err.message
          : "Failed to generate voiceovers",
      );
    } finally {
      setGeneratingAll(false);
      setGenerationProgress(0);
    }
  }, [
    scenes,
    selectedVoiceId,
    projectId,
    playbackSpeed,
    results,
    onVoiceoverGenerated,
  ]);

  // --- Derived values -------------------------------------------------------
  const selectedVoice = voices.find((v) => v.voice_id === selectedVoiceId);
  const isGenerating = generatingAll || generatingSceneId !== null;
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
                  getTTSVoices()
                    .then((data) => {
                      setVoices(data);
                      if (data.length > 0 && !selectedVoiceId) {
                        setSelectedVoiceId(data[0].voice_id);
                      }
                    })
                    .catch((e) =>
                      setVoicesError(
                        e instanceof Error
                          ? e.message
                          : "Failed to load voices",
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

          {/* Voice preview */}
          {selectedVoice?.preview_url && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => {
                const preview = new Audio(selectedVoice.preview_url);
                preview.play();
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
          disabled={isGenerating || !selectedVoiceId || scenes.length === 0}
        >
          {generatingAll ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating all...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-4 w-4" />
              Generate All Voiceovers
            </>
          )}
        </Button>

        {/* Progress bar for batch generation */}
        {generatingAll && generationProgress > 0 && (
          <Progress value={generationProgress} className="h-2" />
        )}

        {/* ── Error message ──────────────────────────────────────────── */}
        {generationError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
            {generationError}
          </div>
        )}

        {/* ── Scene list ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          {scenes.map((scene, index) => {
            const text = buildSceneText(scene);
            const result = results.get(scene.id);
            const isThisGenerating = generatingSceneId === scene.id;
            const isThisPlaying = playingSceneId === scene.id;
            const hasAudio = !!result?.audioUrl;

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

                    {/* Play / Pause button */}
                    {hasAudio && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => playScene(scene.id)}
                      >
                        {isThisPlaying && audioRef.current && !audioRef.current.paused ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}

                    {/* Generate / Regenerate button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={isGenerating || !selectedVoiceId || !text}
                      onClick={() => generateForScene(scene)}
                    >
                      {isThisGenerating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : hasAudio ? (
                        <RefreshCw className="h-3.5 w-3.5" />
                      ) : (
                        <Mic className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Scene text preview */}
                {text ? (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {text}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/60 italic">
                    No text content for this scene
                  </p>
                )}

                {/* Playback progress bar */}
                {isThisPlaying && (
                  <Progress value={playbackProgress} className="h-1" />
                )}

                {/* Word timestamps / caption preview */}
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
