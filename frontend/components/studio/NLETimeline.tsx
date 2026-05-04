"use client";

/**
 * NLETimeline — frame-aware non-linear timeline editor (gap #124).
 *
 * Sits below the preview canvas. Each scene is rendered as a horizontal
 * block sized in proportion to its `duration`. The user can:
 *   - drag a block left/right to reorder
 *   - drag the left/right edge to trim in/out points
 *   - click anywhere on the ruler to seek the playhead
 *   - press S to split the scene under the playhead
 *   - press Delete to delete the selected scene
 *   - press M to merge the selected scene with the next
 *   - right-click a scene boundary to pick a transition
 *
 * All mutations dispatch through `onScriptChange` so they integrate with
 * the existing undo/redo + autosave + version history pipeline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Scissors,
  Trash2,
  Copy as CopyIcon,
  ZoomIn,
  ZoomOut,
  Combine,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { VideoScript, TransitionStyle } from "@/types/video-script";
import {
  reorderScene,
  trimScene,
  splitSceneAtTime,
  mergeWithNext,
  deleteScene,
  duplicateScene,
  setSceneTransition,
  rollEdit,
  slipEdit,
  slideEdit,
} from "@/lib/compiler/scene-ops";
import { useAudioMix, LANE_KEYS, type LaneKey } from "@/lib/hooks/useAudioMix";
import { Slider } from "@/components/ui/slider";
import { Volume2, VolumeX, Music, Mic, Disc3 } from "lucide-react";

interface Props {
  script: VideoScript;
  onScriptChange: (s: VideoScript) => void;
  currentTime: number;
  onSeek: (t: number) => void;
}

const SCENE_COLORS: Record<string, string> = {
  intro:         "bg-violet-500/30 border-violet-500",
  achievement:   "bg-amber-500/30 border-amber-500",
  skills:        "bg-cyan-500/30 border-cyan-500",
  closing:       "bg-rose-500/30 border-rose-500",
  "job-details": "bg-blue-500/30 border-blue-500",
  "company-culture": "bg-emerald-500/30 border-emerald-500",
  cta:           "bg-orange-500/30 border-orange-500",
  testimonial:   "bg-pink-500/30 border-pink-500",
};

function colorFor(type: string): string {
  return SCENE_COLORS[type] ?? "bg-slate-500/30 border-slate-500";
}

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 100);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

const TRANSITION_OPTIONS: TransitionStyle[] = ["cut", "fade", "slide", "cinematic-fade"];

export default function NLETimeline({ script, onScriptChange, currentTime, onSeek }: Props) {
  const { t } = useTranslation();
  const [pixelsPerSecond, setPixelsPerSecond] = useState(60);
  // Audio-lane mix controls share the dialog's source of truth via the
  // useAudioMix hook. The inline lane row writes lane gain + mute; the
  // full editor dialog still owns fade-in/out.
  const audioMix = useAudioMix(script, onScriptChange);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ── Drag state ─────────────────────────────────────────────────────────────
  // Modifier-key trim modes (Lightworks-style):
  //   default        → simple trim of one edge (existing behaviour)
  //   shift+left/right edge → roll edit (move boundary between scenes)
  //   alt + body     → slip edit (move source window inside scene)
  //   ctrl/meta + body → slide edit (move scene on timeline)
  type DragMode =
    | { kind: "trim-left"; index: number; startX: number; origIn: number }
    | { kind: "trim-right"; index: number; startX: number; origOut: number }
    | { kind: "roll";  boundary: number; startX: number; origScript: VideoScript }
    | { kind: "slip";  index: number;    startX: number; origScript: VideoScript }
    | { kind: "slide"; index: number;    startX: number; origScript: VideoScript }
    | { kind: "reorder"; index: number; startX: number }
    | null;
  const dragRef = useRef<DragMode>(null);
  const [dragHoverIndex, setDragHoverIndex] = useState<number | null>(null);

  const totalDuration = useMemo(
    () => script.scenes.reduce((a, s) => a + s.duration, 0),
    [script.scenes],
  );

  // ── Playhead seek on ruler click ───────────────────────────────────────────
  function handleRulerClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (containerRef.current?.scrollLeft ?? 0);
    onSeek(Math.max(0, Math.min(totalDuration, x / pixelsPerSecond)));
  }

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const onMouseMove = useCallback((e: MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dxSec = (e.clientX - drag.startX) / pixelsPerSecond;

    if (drag.kind === "trim-left") {
      const scene = script.scenes[drag.index];
      const sourceDuration = scene.sourceDuration ?? scene.duration;
      const currentOut = scene.outPoint ?? sourceDuration;
      const nextIn = Math.max(0, Math.min(currentOut - 0.1, drag.origIn + dxSec));
      onScriptChange(trimScene(script, drag.index, nextIn, currentOut));
    } else if (drag.kind === "trim-right") {
      const scene = script.scenes[drag.index];
      const sourceDuration = scene.sourceDuration ?? scene.duration;
      const currentIn = scene.inPoint ?? 0;
      const nextOut = Math.max(currentIn + 0.1, Math.min(sourceDuration, drag.origOut + dxSec));
      onScriptChange(trimScene(script, drag.index, currentIn, nextOut));
    } else if (drag.kind === "roll") {
      // Apply the absolute drag delta against the script as it was
      // when the drag started — `origScript` — so we never double-
      // apply the same nudge across mousemove ticks.
      onScriptChange(rollEdit(drag.origScript, drag.boundary, dxSec));
    } else if (drag.kind === "slip") {
      onScriptChange(slipEdit(drag.origScript, drag.index, dxSec));
    } else if (drag.kind === "slide") {
      onScriptChange(slideEdit(drag.origScript, drag.index, dxSec));
    } else if (drag.kind === "reorder") {
      // Compute target index based on cumulative widths
      let cursor = 0;
      let target = script.scenes.length - 1;
      const xRel = e.clientX - (containerRef.current?.getBoundingClientRect().left ?? 0)
        + (containerRef.current?.scrollLeft ?? 0);
      for (let i = 0; i < script.scenes.length; i++) {
        const w = script.scenes[i].duration * pixelsPerSecond;
        if (xRel < cursor + w / 2) { target = i; break; }
        cursor += w;
      }
      setDragHoverIndex(target);
    }
  }, [script, pixelsPerSecond, onScriptChange]);

  const onMouseUp = useCallback(() => {
    const drag = dragRef.current;
    if (drag?.kind === "reorder" && dragHoverIndex != null) {
      onScriptChange(reorderScene(script, drag.index, dragHoverIndex));
    }
    dragRef.current = null;
    setDragHoverIndex(null);
    document.body.style.cursor = "";
  }, [script, dragHoverIndex, onScriptChange]);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore when focus is in an input
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;

      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        onScriptChange(splitSceneAtTime(script, currentTime));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIndex != null) {
          e.preventDefault();
          onScriptChange(deleteScene(script, selectedIndex));
          setSelectedIndex(null);
        }
      } else if (e.key === "m" || e.key === "M") {
        if (selectedIndex != null && selectedIndex < script.scenes.length - 1) {
          e.preventDefault();
          onScriptChange(mergeWithNext(script, selectedIndex));
        }
      } else if (e.key === "d" || e.key === "D") {
        if (selectedIndex != null) {
          e.preventDefault();
          onScriptChange(duplicateScene(script, selectedIndex));
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [script, currentTime, selectedIndex, onScriptChange]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const playheadX = currentTime * pixelsPerSecond;
  const totalWidth = totalDuration * pixelsPerSecond;

  // Frame ruler ticks every second
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let tk = 0; tk <= totalDuration + 0.001; tk += 1) out.push(tk);
    return out;
  }, [totalDuration]);

  return (
    <div className="border-t bg-background flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b bg-muted/20 text-xs">
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => onScriptChange(splitSceneAtTime(script, currentTime))}
          title={t("studio.timeline.splitTitle")}
        >
          <Scissors className="w-3 h-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          disabled={selectedIndex == null || selectedIndex >= script.scenes.length - 1}
          onClick={() => selectedIndex != null && onScriptChange(mergeWithNext(script, selectedIndex))}
          title={t("studio.timeline.mergeTitle")}
        >
          <Combine className="w-3 h-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          disabled={selectedIndex == null}
          onClick={() => {
            if (selectedIndex != null) {
              onScriptChange(duplicateScene(script, selectedIndex));
            }
          }}
          title={t("studio.timeline.duplicateTitle")}
        >
          <CopyIcon className="w-3 h-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          disabled={selectedIndex == null}
          onClick={() => {
            if (selectedIndex != null) {
              onScriptChange(deleteScene(script, selectedIndex));
              setSelectedIndex(null);
            }
          }}
          title={t("studio.timeline.deleteTitle")}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
        <div className="mx-2 h-4 w-px bg-border" />
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => setPixelsPerSecond((p) => Math.max(20, p - 20))}
          title={t("studio.timeline.zoomOut")}
        >
          <ZoomOut className="w-3 h-3" />
        </Button>
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-10 text-center">
          {t("studio.timeline.pixelsPerSecond", { px: pixelsPerSecond })}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => setPixelsPerSecond((p) => Math.min(240, p + 20))}
          title={t("studio.timeline.zoomIn")}
        >
          <ZoomIn className="w-3 h-3" />
        </Button>
        <div className="ml-auto font-mono text-[10px] text-muted-foreground tabular-nums">
          {fmtTime(currentTime)} / {fmtTime(totalDuration)}
        </div>
      </div>

      {/* Scrollable timeline area */}
      <div ref={containerRef} className="overflow-x-auto overflow-y-hidden select-none">
        <div className="relative" style={{ width: Math.max(totalWidth, 800), minHeight: 100 }}>
          {/* Frame ruler */}
          <div
            className="relative h-5 border-b bg-muted/30 cursor-pointer"
            onClick={handleRulerClick}
          >
            {ticks.map((tick) => (
              <div
                key={tick}
                className="absolute top-0 bottom-0 border-l border-border"
                style={{ left: tick * pixelsPerSecond }}
              >
                <span className="absolute top-0 left-1 text-[9px] font-mono text-muted-foreground">
                  {Math.floor(tick / 60)}:{String(tick % 60).padStart(2, "0")}
                </span>
              </div>
            ))}
          </div>

          {/* Scene track */}
          <div className="relative h-16 px-0 py-1">
            {script.scenes.map((scene, i) => {
              const start = script.scenes.slice(0, i).reduce((a, s) => a + s.duration, 0);
              const left = start * pixelsPerSecond;
              const width = Math.max(20, scene.duration * pixelsPerSecond);
              const isSelected = selectedIndex === i;
              const isHover = dragHoverIndex === i;
              return (
                <div
                  key={scene.id}
                  className={`absolute top-1 bottom-1 rounded-md border-2 ${colorFor(scene.type)} ${
                    isSelected ? "ring-2 ring-primary" : ""
                  } ${isHover ? "outline-dashed outline-1 outline-primary" : ""}`}
                  style={{ left, width }}
                  onClick={() => setSelectedIndex(i)}
                >
                  {/* Left trim handle — shift = roll the boundary
                      with the previous scene; default = simple trim */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/40"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      const sceneRef = script.scenes[i];
                      if (e.shiftKey && i > 0) {
                        dragRef.current = { kind: "roll", boundary: i - 1, startX: e.clientX, origScript: script };
                      } else {
                        dragRef.current = {
                          kind: "trim-left",
                          index: i,
                          startX: e.clientX,
                          origIn: sceneRef.inPoint ?? 0,
                        };
                      }
                      document.body.style.cursor = "ew-resize";
                    }}
                  />
                  {/* Right trim handle — shift = roll the boundary
                      with the next scene; default = simple trim */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/40"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      const sceneRef = script.scenes[i];
                      const sourceDuration = sceneRef.sourceDuration ?? sceneRef.duration;
                      if (e.shiftKey && i < script.scenes.length - 1) {
                        dragRef.current = { kind: "roll", boundary: i, startX: e.clientX, origScript: script };
                      } else {
                        dragRef.current = {
                          kind: "trim-right",
                          index: i,
                          startX: e.clientX,
                          origOut: sceneRef.outPoint ?? sourceDuration,
                        };
                      }
                      document.body.style.cursor = "ew-resize";
                    }}
                  />
                  {/* Body drag — modifiers select the trim mode:
                      alt   → slip (move source window inside scene)
                      ctrl  → slide (move scene on timeline)
                      none  → reorder (existing behaviour) */}
                  <div
                    className="absolute inset-x-2 top-0 bottom-0 cursor-grab flex items-center px-1 overflow-hidden"
                    onMouseDown={(e) => {
                      if ((e.target as HTMLElement).closest(".cursor-ew-resize")) return;
                      if (e.altKey) {
                        dragRef.current = { kind: "slip",  index: i, startX: e.clientX, origScript: script };
                        document.body.style.cursor = "ew-resize";
                      } else if (e.ctrlKey || e.metaKey) {
                        dragRef.current = { kind: "slide", index: i, startX: e.clientX, origScript: script };
                        document.body.style.cursor = "ew-resize";
                      } else {
                        dragRef.current = { kind: "reorder", index: i, startX: e.clientX };
                        document.body.style.cursor = "grabbing";
                      }
                    }}
                  >
                    <div className="text-[10px] font-medium truncate text-foreground/90">
                      {scene.title || scene.type}
                    </div>
                  </div>
                  {/* Transition badge (bottom-right) */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="absolute bottom-0 right-0 text-[8px] font-mono px-1 bg-black/40 text-white rounded-tl"
                        onClick={(e) => e.stopPropagation()}
                        title={t("studio.timeline.transitionTitle")}
                      >
                        {scene.transitionIn ?? script.video.theme.transition ?? "fade"}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {TRANSITION_OPTIONS.map((opt) => (
                        <DropdownMenuItem
                          key={opt}
                          onClick={() => onScriptChange(setSceneTransition(script, i, opt))}
                        >
                          {opt}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {/* Trim indicator (shows when scene has been trimmed) */}
                  {scene.inPoint != null && scene.sourceDuration != null && scene.duration < scene.sourceDuration && (
                    <span className="absolute top-0 left-2 text-[8px] font-mono text-white/80">
                      ✂ {scene.duration.toFixed(1)}/{scene.sourceDuration.toFixed(1)}s
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Audio lanes — music / voiceover / recording. Each lane
              row shares its mix-config source with AudioMixerDialog
              via the useAudioMix hook. The lane body shows scheduled
              audio content (full-width for music/voiceover; per-scene
              segments for recording) so scene-block edits are visible
              in lane context. */}
          {LANE_KEYS.map((key) => (
            <AudioLaneRow
              key={key}
              laneKey={key}
              script={script}
              pixelsPerSecond={pixelsPerSecond}
              totalDuration={totalDuration}
              audioMix={audioMix}
            />
          ))}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-10"
            style={{ left: playheadX }}
          >
            <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-red-500 rotate-45" />
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="px-2 py-1 border-t text-[10px] text-muted-foreground flex items-center gap-3">
        <span>{t("studio.timeline.scenesCount", { count: script.scenes.length })}</span>
        <span>·</span>
        <span>{t("studio.timeline.totalDuration", { time: fmtTime(totalDuration) })}</span>
        <span className="ml-auto font-mono">
          {t("studio.timeline.shortcuts")}
        </span>
      </div>
    </div>
  );
}

// ─── Audio lane row ───────────────────────────────────────────────────────────
//
// Self-gating: when the lane has no content AND its mix is at defaults,
// returns null. The parent unconditionally renders all three lanes —
// each decides for itself whether to show. Per the standing DRY rule
// the mix mutation goes through useAudioMix (single source of truth
// shared with AudioMixerDialog).

const LANE_META: Record<LaneKey, { label: string; icon: typeof Music; color: string }> = {
  music:     { label: "Music",     icon: Music, color: "bg-emerald-500/30 border-emerald-500" },
  voiceover: { label: "Voiceover", icon: Mic,   color: "bg-amber-500/30 border-amber-500" },
  recording: { label: "Recording", icon: Disc3, color: "bg-violet-500/30 border-violet-500" },
};

function AudioLaneRow({
  laneKey,
  script,
  pixelsPerSecond,
  totalDuration,
  audioMix,
}: {
  laneKey: LaneKey;
  script: VideoScript;
  pixelsPerSecond: number;
  totalDuration: number;
  audioMix: ReturnType<typeof useAudioMix>;
}) {
  const meta = LANE_META[laneKey];
  const lane = audioMix.laneOf(laneKey);
  const segments = computeLaneSegments(laneKey, script);

  // Self-gate: no content + default mix → don't render the row at all.
  // Mute alone keeps the row visible (user explicitly hid the lane).
  const isDefaultMix =
    (lane.gain ?? 1) === 1 &&
    (lane.fadeInSec ?? 0) === 0 &&
    (lane.fadeOutSec ?? 0) === 0 &&
    !lane.muted;
  if (segments.length === 0 && isDefaultMix) return null;

  const Icon = meta.icon;
  return (
    <div className="relative flex items-center h-9 border-t bg-background/40">
      {/* Track header — sticky-left so it stays put on horizontal scroll. */}
      <div className="sticky left-0 z-10 flex items-center gap-2 px-2 h-full bg-background border-r" style={{ width: 140 }}>
        <Icon className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="text-[10px] font-medium truncate flex-1">{meta.label}</span>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => audioMix.patchLane(laneKey, { muted: !lane.muted })}
          title={lane.muted ? "Unmute" : "Mute"}
        >
          {lane.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
        </button>
        <Slider
          min={0}
          max={2}
          step={0.05}
          value={[lane.gain ?? 1]}
          onValueChange={(v) => audioMix.patchLane(laneKey, { gain: v[0] ?? 1 })}
          className="w-12"
          aria-label={`${meta.label} gain`}
        />
      </div>
      {/* Track body — segments showing where audio is scheduled. */}
      <div className="relative h-full flex-1" style={{ width: Math.max(totalDuration * pixelsPerSecond, 800) - 140 }}>
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`absolute top-1 bottom-1 rounded border ${meta.color} ${lane.muted ? "opacity-30" : ""}`}
            style={{ left: seg.startSec * pixelsPerSecond, width: Math.max(8, (seg.endSec - seg.startSec) * pixelsPerSecond) }}
            title={seg.label}
          >
            <div className="text-[8px] px-1 truncate text-foreground/80">{seg.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface LaneSegment {
  startSec: number;
  endSec: number;
  label: string;
}

/** Materialise lane segments from VideoScript. Per the standing DRY
 *  rule this is the ONE place "what audio is scheduled where?" is
 *  computed; the lane row is purely presentational. */
function computeLaneSegments(laneKey: LaneKey, script: VideoScript): LaneSegment[] {
  const totalDuration = script.scenes.reduce((a, s) => a + s.duration, 0);
  if (laneKey === "music") {
    const audio = script.video.audio;
    if (!audio || audio.track === "none") return [];
    return [{ startSec: 0, endSec: totalDuration, label: audio.label || audio.track }];
  }
  if (laneKey === "recording") {
    // Per-scene `sceneAudio` URLs occupy each scene's slot on the
    // recording lane.
    const out: LaneSegment[] = [];
    let cursor = 0;
    for (const scene of script.scenes) {
      const start = cursor;
      cursor += scene.duration;
      if (scene.sceneAudio) {
        out.push({ startSec: start, endSec: cursor, label: scene.sceneAudioLabel ?? "Recording" });
      }
    }
    return out;
  }
  // Voiceover: per-scene voiceover audio lives on `StudioProjectState`
  // (UI-side) rather than VideoScript today, so the script alone can't
  // tell us which scenes have voiceover. Return empty until that data
  // lifts onto the script — see the gap register entry.
  return [];
}
