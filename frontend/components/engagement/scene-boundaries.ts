/**
 * Derive chapter-seed scene boundaries (title + start seconds) and total
 * duration from a Studio project DTO — the landing-card / details-drawer
 * path has no live canvas, so ChapterEditor would otherwise fall back to
 * a single "Intro @ 0:00".
 *
 * Priority matches the editor load path (`projectCanvasState`):
 *   1. v2 `timelineSpec` (nle) via `timelineToCanvasState`
 *   2. v1 `script.scenes`
 *   3. legacy `storyboard.scenes`
 *
 * Invalid / empty timeline JSON must NOT collapse to `emptyCanvasState()`'s
 * fake "Scene 1" (that would auto-seed a bogus chapter).
 */
import { timelineToCanvasState } from "@/lib/studio/editor-v2/timeline-emit";
import type { Timeline } from "@shared/timeline";
import type { SceneBoundary } from "@/components/studio/ChapterEditor";

export type { SceneBoundary };

export interface ChapterSeed {
  sceneBoundaries: SceneBoundary[];
  durationSec: number;
}

export interface ChapterSeedSource {
  timelineSpec?: unknown;
  script?: { scenes?: LooseScene[] } | null;
  storyboard?: { scenes?: LooseScene[] } | null;
}

interface LooseScene {
  title?: unknown;
  label?: unknown;
  type?: unknown;
  duration?: unknown;
  durationSeconds?: unknown;
}

const EMPTY_SEED: ChapterSeed = { sceneBoundaries: [], durationSec: 0 };

/** Same predicate `timelineToCanvasState` uses before hydrating clips. */
export function looksLikeTimeline(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { tracks?: unknown }).tracks) &&
    typeof (value as { fps?: unknown }).fps === "number"
  );
}

/** True when the DTO already carries a shape we can seed from (no GET). */
export function hasSeedSource(project: ChapterSeedSource): boolean {
  if (looksLikeTimeline(project.timelineSpec)) return true;
  if (Array.isArray(project.script?.scenes) && project.script.scenes.length > 0) {
    return true;
  }
  if (
    Array.isArray(project.storyboard?.scenes) &&
    project.storyboard.scenes.length > 0
  ) {
    return true;
  }
  return false;
}

/** Cumulative start times — same reduction ActionsPanel uses on canvas scenes. */
export function sceneBoundariesFromCanvas(
  scenes: Array<{ label: string; durationSeconds: number }>,
): ChapterSeed {
  let start = 0;
  const sceneBoundaries: SceneBoundary[] = scenes.map((s) => {
    const boundary: SceneBoundary = {
      title: s.label.trim() || "Scene",
      start,
    };
    start += Math.max(0, s.durationSeconds);
    return boundary;
  });
  return { sceneBoundaries, durationSec: start };
}

function labelOf(scene: LooseScene, index: number): string {
  if (typeof scene.label === "string" && scene.label.trim()) return scene.label.trim();
  if (typeof scene.title === "string" && scene.title.trim()) return scene.title.trim();
  if (typeof scene.type === "string" && scene.type.trim()) return scene.type.trim();
  return `Scene ${index + 1}`;
}

function durationOf(scene: LooseScene): number {
  if (typeof scene.durationSeconds === "number" && Number.isFinite(scene.durationSeconds)) {
    return Math.max(0, scene.durationSeconds);
  }
  if (typeof scene.duration === "number" && Number.isFinite(scene.duration)) {
    return Math.max(0, scene.duration);
  }
  return 5;
}

function seedFromLooseScenes(scenes: LooseScene[] | undefined): ChapterSeed | null {
  if (!Array.isArray(scenes) || scenes.length === 0) return null;
  return sceneBoundariesFromCanvas(
    scenes.map((s, i) => ({
      label: labelOf(s, i),
      durationSeconds: durationOf(s),
    })),
  );
}

export function chapterSeedFromProject(project: ChapterSeedSource): ChapterSeed {
  if (looksLikeTimeline(project.timelineSpec)) {
    const canvas = timelineToCanvasState(project.timelineSpec as Timeline);
    if (canvas.scenes.length > 0) {
      return sceneBoundariesFromCanvas(canvas.scenes);
    }
  }
  const fromScript = seedFromLooseScenes(project.script?.scenes);
  if (fromScript) return fromScript;
  const fromStoryboard = seedFromLooseScenes(project.storyboard?.scenes);
  if (fromStoryboard) return fromStoryboard;
  return EMPTY_SEED;
}

export function formatSceneTimestamp(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
