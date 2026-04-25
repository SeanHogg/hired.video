// video-compiler.ts — compiles a VideoScript DSL into a CompiledVideo that
// the frame renderer can evaluate at any timestamp.

import type { VideoScript } from "../../types/video-script";
import type { CompiledVideo, CompiledScene, SceneNode } from "./types";
// satisfies import used for transition type assertion

import { buildSceneGraph } from "./scene-graph";

// ─── Branding scenes (intro + outro) ──────────────────────────────────────────
// When includeBranding is true (default for free users), prepend a 1.5s intro
// and append a 2s outro card around the user's content. Both cards are built
// directly as CompiledScene structures so they don't require the script DSL.

const INTRO_DURATION = 1.5;
const OUTRO_DURATION = 2.0;
const LOGO_URL = "/pwa-512x512.png";

function brandingNode(
  type: SceneNode["type"],
  content: string | undefined,
  overrides: Partial<SceneNode> = {},
): SceneNode {
  return {
    id: `brand-${type}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, alpha: 1 },
    style: {
      color: "#ffffff",
      fontSize: 80,
      fontFamily: "Inter, Segoe UI, system-ui, sans-serif",
      fontWeight: "bold",
      textAlign: "center",
      lineHeight: 1.2,
      padding: 0,
    },
    content,
    animations: [],
    ...overrides,
  };
}

function buildBrandingScene(
  kind: "intro" | "outro",
  start: number,
  width: number,
  height: number,
): CompiledScene {
  const isIntro = kind === "intro";
  const duration = isIntro ? INTRO_DURATION : OUTRO_DURATION;
  const headline = "hired.video";
  const tagline = isIntro ? "AI Video Resumes" : "Make yours at hired.video";

  // Logo as a centered image element occupying the upper portion of the frame.
  const logoElement: SceneNode = {
    id: `brand-logo-${kind}`,
    type: "element",
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, alpha: 1 },
    style: {
      color: "#ffffff",
      fontSize: 0,
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal",
      textAlign: "center",
      lineHeight: 1,
      padding: 0,
    },
    animations: [],
    element: {
      id: `brand-logo-el-${kind}`,
      kind: "image",
      url: LOGO_URL,
      box: { x: 38, y: 18, w: 24, h: 36 },
      fit: "contain",
    },
  };

  const headlineNode = brandingNode("text", headline, {
    style: {
      color: "#ffffff",
      fontSize: Math.round(height * 0.11),
      fontFamily: "Inter, Segoe UI, sans-serif",
      fontWeight: "bold",
      textAlign: "center",
      lineHeight: 1.1,
      padding: 0,
    },
  });

  const taglineNode = brandingNode("text", tagline, {
    style: {
      color: "#a78bfa",
      fontSize: Math.round(height * 0.04),
      fontFamily: "Inter, Segoe UI, sans-serif",
      fontWeight: "normal",
      textAlign: "center",
      lineHeight: 1.3,
      padding: 0,
    },
  });

  return {
    id: `brand-${kind}`,
    type: isIntro ? "intro" : "closing",
    start,
    duration,
    background: "gradient:#3b2098:#3b82f6",
    contentPosition: "center",
    nodes: [logoElement, headlineNode, taglineNode],
    transitionIn: "fade",
  };
}

const RESOLUTION_MAP: Record<string, { w: number; h: number }> = {
  "720p":  { w: 1280, h: 720  },
  "1080p": { w: 1920, h: 1080 },
  "4k":    { w: 3840, h: 2160 }, // gap #133 — Premium-gated at the export route
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
   * When true (default), prepend an intro card and append an outro card, and
   * leave the watermark visible. Pass false for Pro users who have opted out.
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

  // Intro card (free + opted-in users only)
  if (includeBranding) {
    const intro = buildBrandingScene("intro", cursor, width, height);
    compiledScenes.push(intro);
    cursor += intro.duration;
  }

  // User scenes
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
    });
  }

  // Outro card
  if (includeBranding) {
    const outro = buildBrandingScene("outro", cursor, width, height);
    compiledScenes.push(outro);
    cursor += outro.duration;
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
