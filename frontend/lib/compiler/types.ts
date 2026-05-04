// Internal types for the Video Compiler Engine.
// These are not the DSL types (see video-script.ts) — they are the compiled
// output that the frame renderer evaluates at each timestamp.

import type { SceneType, EasingType } from "../../types/video-script";

// ─── Transform & Style ───────────────────────────────────────────────────────

export interface Transform2D {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // degrees
  alpha: number;    // 0–1
}

export interface NodeStyle {
  color: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: "normal" | "bold";
  textAlign: CanvasTextAlign;
  lineHeight: number;
  padding: number;
  background?: string;
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
  blur?: number;
}

// ─── Scene Nodes ─────────────────────────────────────────────────────────────

export type SceneNodeType =
  | "background"
  | "text"
  | "textGroup"
  | "skillBubble"
  | "overlay"
  | "particles"
  | "image"
  | "element";

export interface SceneNode {
  id: string;
  type: SceneNodeType;
  transform: Transform2D;
  style: NodeStyle;
  content?: string;
  items?: string[];    // for textGroup / skillBubble lists
  children?: SceneNode[];
  // Resolved animations keyed by property name
  animations: CompiledAnimation[];
  /** 0–1 progress for typewriter text-reveal animation; undefined = show all text */
  textRevealProgress?: number;
  /** Ken Burns animation key for image nodes */
  kenBurns?: string;
  /** Free-form scene element data (only set when type === "element"). */
  element?: import("../../types/video-script").SceneElement;
}

// ─── Animations ──────────────────────────────────────────────────────────────

export interface CompiledAnimation {
  property: "alpha" | "x" | "y" | "scaleX" | "scaleY";
  fromValue: number;
  toValue: number;
  startTime: number;   // absolute seconds within scene
  endTime: number;
  easing: EasingType;
  isTypewriter?: boolean;
  /** Returns interpolated value at elapsed seconds within scene. */
  evaluate(elapsed: number): number;
}

// ─── Compiled Scene & Video ───────────────────────────────────────────────────

export interface CompiledScene {
  id: string;
  type: SceneType;
  start: number;       // absolute video seconds
  duration: number;
  nodes: SceneNode[];
  /** Background fill: CSS colour or "gradient:…" token. */
  background: string;
  contentPosition?: "top" | "center" | "bottom";
  /** Per-boundary entry transition (gap #124). Falls back to theme default if absent. */
  transitionIn?: "cut" | "fade" | "slide" | "cinematic-fade";
  /**
   * Per-scene effects routed through the shared effect registry. Already
   * normalised to `{kind, params}` at compile time so the renderer never
   * has to deal with the legacy `{type, intensity}` shape. Empty / null =
   * no effects on this scene.
   */
  effects?: import("../../types/video-script").SceneEffect[];
}

export interface CompiledVideo {
  totalDuration: number;
  fps: number;
  width: number;
  height: number;
  scenes: CompiledScene[];
  transition: "cut" | "fade" | "slide" | "cinematic-fade";
  /**
   * Whether hired.video branding (intro card, outro card, watermark pill)
   * should be rendered. Defaults to `true` when omitted so existing callers
   * preserve current behaviour. Set false at compile time to remove all
   * branding (Pro plan only).
   */
  includeBranding?: boolean;
  /** Render preset propagated from `script.video.codec/container/audioCodec`.
   *  Empty/h264 → WebCodecs fast path; anything else → ffmpeg.wasm. */
  codec?: "h264" | "h265" | "prores" | "dnxhd" | "vp9";
  container?: "mp4" | "mov" | "webm";
  audioCodec?: "aac" | "pcm" | "opus";
  videoBitrate?: number;
  audioBitrate?: number;
  /** Returns the scene active at `time` seconds (or the last scene). */
  getSceneAt(time: number): CompiledScene;
}
