// video-compiler.ts — compiles a VideoScript DSL into a CompiledVideo that
// the frame renderer can evaluate at any timestamp.

import type { VideoScript } from "../../types/video-script";
import type { CompiledVideo, CompiledScene } from "./types";
// satisfies import used for transition type assertion

import { buildSceneGraph } from "./scene-graph";

const RESOLUTION_MAP: Record<string, { w: number; h: number }> = {
  "720p":  { w: 1280, h: 720  },
  "1080p": { w: 1920, h: 1080 },
};

const ASPECT_MAP: Record<string, { w: number; h: number }> = {
  "16:9": { w: 16, h: 9  },
  "9:16": { w: 9,  h: 16 },
  "1:1":  { w: 1,  h: 1  },
};

function resolveSize(resolution: string, aspect: string): { width: number; height: number } {
  const base = RESOLUTION_MAP[resolution] ?? { w: 1280, h: 720 };
  const ratio = ASPECT_MAP[aspect] ?? { w: 16, h: 9 };
  // Use resolution height as the short side for non-16:9
  const height = base.h;
  const width  = Math.round((height * ratio.w) / ratio.h);
  return { width, height };
}

// ─── Background helper ────────────────────────────────────────────────────────

function sceneBackground(theme: VideoScript["video"]["theme"]): string {
  const p = theme.colorPalette;
  switch (theme.background) {
    case "solid":           return p[0] ?? "#1a1a2e";
    case "dark-tech-grid":  return `dark-tech-grid:${p[0] ?? "#0f0f23"}`;
    case "particles":       return `particles:${p[0] ?? "#7c3aed"}`;
    default:                return `gradient:${p[0] ?? "#7c3aed"}:${p[1] ?? "#2563eb"}`;
  }
}

// ─── Compiler ─────────────────────────────────────────────────────────────────

export function compile(script: VideoScript): CompiledVideo {
  const { video, scenes } = script;
  const { width, height } = resolveSize(video.resolution, video.aspect);
  const theme = video.theme;

  const compiledScenes: CompiledScene[] = scenes.map((scene) => ({
    id: scene.id,
    type: scene.type,
    start: scene.start,
    duration: scene.duration,
    background: sceneBackground(theme),
    nodes: buildSceneGraph(scene, theme),
  }));

  // Ensure scenes are time-sorted
  compiledScenes.sort((a, b) => a.start - b.start);

  const totalDuration = video.duration;

  return {
    totalDuration,
    fps: video.fps ?? 30,
    width,
    height,
    scenes: compiledScenes,
    transition: (theme.transition ?? "fade") as CompiledVideo["transition"],
    getSceneAt(time: number): CompiledScene {
      // Find the scene whose time-window contains `time`
      for (let i = compiledScenes.length - 1; i >= 0; i--) {
        if (time >= compiledScenes[i].start) return compiledScenes[i];
      }
      return compiledScenes[0];
    },
  };
}
