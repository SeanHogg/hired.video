// video-compiler.ts — compiles a VideoScript DSL into a CompiledVideo that
// the frame renderer can evaluate at any timestamp.
//
// Branding note: this compiler used to prepend a 1.5s intro and append a
// 2.0s outro scene to the timeline whenever the user wasn't a Pro who'd
// opted out of branding. That wrecked WYSIWYG (preview was N seconds,
// export was N+3.5s) and forced every downstream consumer — scene-index
// math, scrub handling, timeline ticks, voiceover scheduling — to reason
// about phantom scenes the user didn't author. Branding now lives at the
// player layer instead: the EndCapOverlay shows after natural end of
// playback, and the corner watermark is still rendered by the frame
// renderer when `compiledVideo.includeBranding !== false`.

import type { VideoScript } from "../../types/video-script";
import { normaliseSceneEffect } from "../../types/video-script";
import type { CompiledVideo, CompiledScene } from "./types";
// satisfies import used for transition type assertion

import { buildSceneGraph } from "./scene-graph";

const RESOLUTION_MAP: Record<string, { w: number; h: number }> = {
  "720p":  { w: 1280, h: 720  },
  "1080p": { w: 1920, h: 1080 },
  "4k":    { w: 3840, h: 2160 }, // gap #133 — Pro-gated at the export route
};

const ASPECT_MAP: Record<string, { w: number; h: number }> = {
  "16:9": { w: 16, h: 9  },
  "9:16": { w: 9,  h: 16 },
  "1:1":  { w: 1,  h: 1  },
  "4:3":  { w: 4,  h: 3  },
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

export interface CompileOptions {
  /**
   * Controls only the corner watermark on rendered frames — the intro/outro
   * cards are no longer part of the compiled timeline (see file header).
   * Default is true; pass false for Pro users who've opted out.
   */
  includeBranding?: boolean;
}

export function compile(script: VideoScript, options: CompileOptions = {}): CompiledVideo {
  const { video, scenes } = script;
  const { width, height } = resolveSize(video.resolution, video.aspect);
  const theme = video.theme;
  const includeBranding = options.includeBranding !== false; // default true

  // NLE behaviour (gap #124): treat the scene array as the canonical edit
  // order and recompute `start` from cumulative durations. This makes split,
  // merge, trim, and reorder operations transparent to downstream renderers
  // — they only need to mutate the array and update `duration`. Legacy
  // projects whose scene order matches their `start` order are unaffected.
  let cursor = 0;

  const compiledScenes: CompiledScene[] = [];

  for (const scene of scenes) {
    const start = cursor;
    cursor += scene.duration;
    compiledScenes.push({
      id: scene.id,
      type: scene.type,
      start,
      duration: scene.duration,
      background: sceneBackground(theme),
      contentPosition: scene.contentPosition,
      nodes: buildSceneGraph(scene, theme),
      transitionIn: scene.transitionIn,
      // Normalise effects at compile time so the renderer always sees
      // `{kind, params}` regardless of whether the scene was last
      // saved before or after the registry migration.
      effects: scene.effects?.map(normaliseSceneEffect),
    });
  }

  const totalDuration = cursor || video.duration;

  return {
    totalDuration,
    fps: video.fps ?? 30,
    width,
    height,
    scenes: compiledScenes,
    transition: (theme.transition ?? "fade") as CompiledVideo["transition"],
    includeBranding,
    getSceneAt(time: number): CompiledScene {
      // Find the scene whose time-window contains `time`
      for (let i = compiledScenes.length - 1; i >= 0; i--) {
        if (time >= compiledScenes[i].start) return compiledScenes[i];
      }
      return compiledScenes[0];
    },
  };
}
