/**
 * Convert a v1 VideoScript into v2 CanvasState so existing projects open
 * in the v2 editor with their scenes + media intact. v1 projects either
 * have `script` populated (`kind='scene'` storyboard) OR `timelineSpec`
 * (NLE timeline). When v2 opens a project the loader tries the timeline
 * route first via `timelineToCanvasState`; if that yields an empty
 * canvas (i.e. no `canvas-v2:*` effects), it falls back to this script
 * importer, so a v1-authored project still shows the user's content.
 *
 * Mapping (one scene → one Scene, one widget per logical element):
 *   - title    → heading widget (top of frame)
 *   - subtitle → text widget under the heading
 *   - text     → body text widget (joined when an array)
 *   - items    → bulleted text widget
 *   - skills   → chip-style text widget
 *   - backgroundImage / overlayMediaUrl → image OR video widget
 *   - sceneElements → free-form widgets already positioned by the v1
 *     editor; box uses % so we just normalise to fractions
 *   - script.video.audio.track → musicSource (stock id)
 *
 * Single source of truth: every "open a v1 project in v2" path calls
 * this function. No consumer hand-rolls the mapping.
 */
import type {
  VideoScript,
  SceneScript,
  SceneElement,
  ElementBox,
  ElementStyle,
  ImageAnimation,
  VideoFilters as ScriptVideoFilters,
  SceneEffect,
} from "@/types/video-script";
import { normaliseSceneEffect } from "@/types/video-script";
import type { VideoFilters as CanvasVideoFilters } from "../video-filters";
import {
  CANVAS_STATE_VERSION,
  emptyCanvasState,
  type CanvasState,
  type ContainerStyle,
  type Scene,
  type VoiceoverClip,
  type Widget,
  type WidgetAnimation,
  type WidgetParams,
  type WidgetPosition,
} from "./canvas-state";

const RESOLUTION_TO_WH: Record<string, { width: number; height: number }> = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "4k": { width: 3840, height: 2160 },
};

const ASPECT_TO_WH: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:3": { width: 1440, height: 1080 },
};

export function scriptToCanvasState(script: VideoScript): CanvasState {
  const dim =
    ASPECT_TO_WH[script.video.aspect] ??
    RESOLUTION_TO_WH[script.video.resolution] ??
    { width: 1920, height: 1080 };
  const fps = script.video.fps ?? 30;
  const accent = script.video.theme?.colorPalette?.[1] ?? "#a78bfa";
  const surface = script.video.theme?.colorPalette?.[2] ?? "#ffffff";

  const scenes: Scene[] = script.scenes.length > 0
    ? script.scenes.map((s) => sceneToScene(s, accent, surface, script))
    : emptyCanvasState({ width: dim.width, height: dim.height, fps }).scenes;

  const musicTrack = script.video.audio?.track;
  return {
    schemaVersion: CANVAS_STATE_VERSION,
    width: dim.width,
    height: dim.height,
    fps,
    scenes,
    themeId: null,
    musicSource:
      musicTrack && musicTrack !== "none" && musicTrack !== "custom"
        ? { kind: "stock", trackId: musicTrack }
        : null,
    captions: null,
    // Per-scene `sceneAudio` strings + sceneElements audio entries
    // hoist into voiceovers, anchored to their source scene so the
    // composition's per-scene audio survives import (gap #604).
    voiceovers: collectVoiceovers(script),
    codec: null,
    motion: null,
    defaultTransition: null,
    fontFamily: null,
    colorPalette: null,
  };
}

function collectVoiceovers(script: VideoScript): VoiceoverClip[] {
  const out: VoiceoverClip[] = [];
  for (const s of script.scenes) {
    if (s.sceneAudio) {
      out.push({
        id: `vo_${s.id}_audio`,
        url: s.sceneAudio,
        durationSeconds: s.duration,
        anchorSceneId: s.id,
        label: s.sceneAudioLabel ?? "Scene audio",
      });
    }
    for (const el of s.sceneElements ?? []) {
      if (el.kind === "audio" && el.url) {
        out.push({
          id: `vo_${el.id}`,
          url: el.url,
          durationSeconds: s.duration,
          anchorSceneId: s.id,
          label: el.label ?? "Audio",
        });
      }
    }
  }
  return out;
}

function sceneToScene(
  scene: SceneScript,
  accent: string,
  surface: string,
  script: VideoScript,
): Scene {
  const widgets: Widget[] = [];

  // Background / overlay media — produce image or video widget covering
  // the canvas (or the v1 element box when present).
  if (scene.backgroundImage) {
    widgets.push(
      mediaWidget({
        url: scene.backgroundImage,
        mediaType: scene.backgroundMediaType ?? "image",
        position: positionFromImagePosition(scene.backgroundImagePosition, true),
        z: 0,
        animation: scene.imageAnimation,
      }),
    );
  }
  if (scene.overlayMediaUrl) {
    widgets.push(
      mediaWidget({
        url: scene.overlayMediaUrl,
        mediaType: scene.overlayMediaType ?? "image",
        position: positionFromImagePosition(scene.overlayMediaPosition, false),
        z: 1,
        animation: scene.overlayMediaAnimation,
      }),
    );
  }

  const textColor = scene.textColor ?? surface;
  const accentColor = scene.accentColor ?? accent;
  const align = scene.textAlign ?? "left";

  if (scene.title) {
    widgets.push(
      textLikeWidget({
        kind: "heading",
        text: scene.title,
        position: { x: 0.06, y: 0.12, width: 0.88, height: 0.18, z: 5, rotation: 0 },
        fontPx: 72,
        color: accentColor,
        align,
        weight: "bold",
      }),
    );
  }
  if (scene.subtitle) {
    widgets.push(
      textLikeWidget({
        kind: "text",
        text: scene.subtitle,
        position: { x: 0.06, y: 0.32, width: 0.88, height: 0.1, z: 5, rotation: 0 },
        fontPx: 36,
        color: textColor,
        align,
        weight: "normal",
      }),
    );
  }
  const body = normaliseBodyText(scene.text, scene.items);
  if (body) {
    widgets.push(
      textLikeWidget({
        kind: "text",
        text: body,
        position: { x: 0.06, y: 0.46, width: 0.88, height: 0.36, z: 5, rotation: 0 },
        fontPx: 30,
        color: textColor,
        align,
        weight: "normal",
      }),
    );
  }
  if (scene.skills && scene.skills.length > 0) {
    // Render v1 skills as a v2 chips widget — preserves the pill
    // styling that the old " · "-joined fallback collapsed (gap #611).
    widgets.push(
      chipsWidget({
        chips: scene.skills,
        position: { x: 0.06, y: 0.82, width: 0.88, height: 0.1, z: 5, rotation: 0 },
        chipColor: accentColor,
        textColor: textColor,
      }),
    );
  }

  // sceneElements override the slot layout above when present — they're
  // user-positioned in v1's "free form" mode and need to land where the
  // user put them.
  if (scene.sceneElements && scene.sceneElements.length > 0) {
    for (const el of scene.sceneElements) {
      const w = elementToWidget(el, accentColor, textColor);
      if (w) widgets.push(w);
    }
  }

  // Preserve v1-only fields so opening + saving a v1 project doesn't
  // silently drop scene-type semantics, enter-animation specs, or
  // per-scene visual effects (gap #611). Stored at scene scope until
  // the v2 inspector surfaces native UIs for each.
  const effects: SceneEffect[] | undefined =
    scene.effects && scene.effects.length > 0
      ? scene.effects.map((e) => normaliseSceneEffect(e as any))
      : undefined;

  return {
    id: scene.id || `scene_${Math.random().toString(36).slice(2, 10)}`,
    label: scene.title || labelFromType(scene.type, scene.id),
    durationSeconds: scene.duration || 5,
    backgroundColor: resolveSceneBackground(scene, script),
    widgets,
    // v1's VideoFilters has every field optional; v2's CanvasState
    // VideoFilters requires every field. Hoist with defaults so the
    // shapes line up and the CSS render math sees a known value for
    // each slider.
    filters: normaliseFilters(script.video.theme?.filters),
    sourceSceneType: scene.type,
    sourceEnterAnimations: scene.animation
      ? {
          titleEnter: scene.animation.titleEnter,
          subtitleEnter: scene.animation.subtitleEnter,
          textEnter: scene.animation.textEnter,
        }
      : undefined,
    effects,
    transitionIn: scene.transitionIn ?? null,
  };
}

function normaliseFilters(f: ScriptVideoFilters | undefined): CanvasVideoFilters | null {
  if (!f) return null;
  return {
    brightness: f.brightness ?? 1,
    contrast: f.contrast ?? 1,
    saturation: f.saturation ?? 1,
    hue: f.hueRotate ?? 0,
    blur: f.blur ?? 0,
    // v1's warmth is -100..100; v2's CSS-mapped warmth is -1..1.
    warmth: typeof f.warmth === "number" ? f.warmth / 100 : 0,
  };
}

function resolveSceneBackground(scene: SceneScript, script: VideoScript): string {
  // Prefer explicit accentColor when set, then theme palette[0], else dark.
  if (scene.accentColor) return scene.accentColor;
  const palette = script.video.theme?.colorPalette;
  if (palette && palette[0]) return palette[0];
  return "#0f172a";
}

function labelFromType(type: string, id: string | undefined): string {
  if (!type) return id ?? "Scene";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function normaliseBodyText(
  text: string | string[] | undefined,
  items: string[] | undefined,
): string {
  if (Array.isArray(text) && text.length > 0) return text.join("\n");
  if (typeof text === "string" && text.length > 0) return text;
  if (items && items.length > 0) return items.map((i) => `• ${i}`).join("\n");
  return "";
}

function mediaWidget({
  url,
  mediaType,
  position,
  z,
  animation,
  containerStyle,
}: {
  url: string;
  mediaType: "image" | "video";
  position: WidgetPosition;
  z: number;
  animation?: ImageAnimation;
  containerStyle?: ContainerStyle;
}): Widget {
  const ken: WidgetAnimation = normaliseAnimation(animation);
  const params: WidgetParams =
    mediaType === "video"
      ? {
          kind: "video",
          data: { source: { kind: "url", url }, muted: true, animation: ken },
        }
      : {
          kind: "image",
          data: { source: { kind: "url", url }, fit: "cover", animation: ken },
        };
  return {
    id: `w_${Math.random().toString(36).slice(2, 10)}`,
    kind: mediaType,
    position: { ...position, z },
    params,
    visibleFrom: null,
    visibleTo: null,
    motion: null,
    containerStyle,
  };
}

function normaliseAnimation(value: ImageAnimation | undefined): WidgetAnimation {
  if (value === undefined) return "none";
  return value;
}

function normaliseContainerStyle(style: ElementStyle | undefined): ContainerStyle | undefined {
  if (!style) return undefined;
  const out: ContainerStyle = {};
  if (style.backgroundColor !== undefined) out.backgroundColor = style.backgroundColor;
  if (style.borderColor !== undefined) out.borderColor = style.borderColor;
  if (style.borderWidth !== undefined) out.borderWidth = style.borderWidth;
  if (style.borderRadius !== undefined) out.borderRadius = style.borderRadius;
  if (style.padding !== undefined) out.padding = style.padding;
  return Object.keys(out).length === 0 ? undefined : out;
}

function chipsWidget({
  chips,
  position,
  chipColor,
  textColor,
  fontPx = 14,
  fontFamily,
  direction = "row",
}: {
  chips: string[];
  position: WidgetPosition;
  chipColor: string;
  textColor: string;
  fontPx?: number;
  fontFamily?: string;
  direction?: "row" | "column";
}): Widget {
  return {
    id: `w_${Math.random().toString(36).slice(2, 10)}`,
    kind: "chips",
    position,
    params: {
      kind: "chips",
      data: { chips, fontPx, fontFamily, chipColor, textColor, direction },
    },
    visibleFrom: null,
    visibleTo: null,
    motion: null,
  };
}

function textLikeWidget({
  kind,
  text,
  position,
  fontPx,
  color,
  align,
  weight,
}: {
  kind: "text" | "heading";
  text: string;
  position: WidgetPosition;
  fontPx: number;
  color: string;
  align: "left" | "center" | "right";
  weight: "normal" | "bold";
}): Widget {
  return {
    id: `w_${Math.random().toString(36).slice(2, 10)}`,
    kind,
    position,
    params: {
      kind,
      data: {
        text,
        fontPx,
        color,
        fontWeight: weight,
        align,
        background: null,
      },
    },
    visibleFrom: null,
    visibleTo: null,
    motion: null,
  };
}

function elementToWidget(
  el: SceneElement,
  accent: string,
  surface: string,
): Widget | null {
  const position = boxToPosition(el.box, el.z ?? 6, el.rotation ?? 0);
  const containerStyle = normaliseContainerStyle(el.style);
  switch (el.kind) {
    case "text": {
      const widget = textLikeWidget({
        kind: "text",
        text: el.text,
        position,
        fontPx: el.fontSize ?? 32,
        color: el.color ?? surface,
        align: el.align ?? "left",
        weight: el.fontWeight ?? "normal",
      });
      widget.containerStyle = containerStyle;
      return widget;
    }
    case "image":
      return mediaWidget({
        url: el.url,
        mediaType: "image",
        position,
        z: position.z,
        animation: el.animation,
        containerStyle,
      });
    case "video":
      return mediaWidget({
        url: el.url,
        mediaType: "video",
        position,
        z: position.z,
        containerStyle,
      });
    case "chips": {
      // Native chips widget preserves chip colours + direction + font
      // verbatim (gap #611). The previous code collapsed chips into a
      // joined-text widget which lost every styling field.
      return {
        id: el.id || `w_${Math.random().toString(36).slice(2, 10)}`,
        kind: "chips",
        position,
        params: {
          kind: "chips",
          data: {
            chips: el.chips,
            fontPx: el.fontSize ?? 14,
            fontFamily: el.fontFamily,
            chipColor: el.chipColor ?? accent,
            textColor: el.textColor ?? surface,
            direction: el.direction ?? "row",
          },
        },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
        containerStyle,
      };
    }
    case "chart":
      return {
        id: el.id || `w_${Math.random().toString(36).slice(2, 10)}`,
        kind: "chart",
        position,
        params: {
          kind: "chart",
          data: {
            chartType: el.chartType,
            data: el.data,
            format: el.format,
            title: el.title,
            takeaway: el.takeaway,
            colors: el.colors,
          },
        },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
        containerStyle,
      };
    case "webcam":
      return {
        id: el.id || `w_${Math.random().toString(36).slice(2, 10)}`,
        kind: "webcam",
        position,
        params: {
          kind: "webcam",
          data: {
            recordingUrl: el.recordingUrl ?? null,
            mirror: el.mirror ?? true,
            muted: el.muted ?? false,
          },
        },
        visibleFrom: null,
        visibleTo: null,
        motion: null,
        containerStyle,
      };
    case "audio":
      // Audio elements hoist into top-level voiceovers (see
      // `collectVoiceovers`) rather than living as a canvas widget,
      // because v2 doesn't have a non-visual widget kind.
      return null;
  }
}

function boxToPosition(box: ElementBox, z: number, rotation: number): WidgetPosition {
  return {
    x: clamp01(box.x / 100),
    y: clamp01(box.y / 100),
    width: clamp01(box.w / 100),
    height: clamp01(box.h / 100),
    z,
    rotation,
  };
}

// v1 ImagePosition is a fixed-slot enum (full / half-left / corner-tl / …).
// Translate each named slot to a fractional rectangle so it lands in
// roughly the same place when the scene opens in v2.
function positionFromImagePosition(
  pos: string | undefined,
  fullDefault: boolean,
): WidgetPosition {
  const z = 0;
  const rotation = 0;
  const rect = (
    x: number,
    y: number,
    width: number,
    height: number,
  ): WidgetPosition => ({ x, y, width, height, z, rotation });
  switch (pos) {
    case "half-left":   return rect(0, 0, 0.5, 1);
    case "half-right":  return rect(0.5, 0, 0.5, 1);
    case "small-left":  return rect(0.05, 0.55, 0.4, 0.4);
    case "small-right": return rect(0.55, 0.55, 0.4, 0.4);
    case "corner-tl":   return rect(0.04, 0.04, 0.3, 0.3);
    case "corner-tr":   return rect(0.66, 0.04, 0.3, 0.3);
    case "corner-bl":   return rect(0.04, 0.66, 0.3, 0.3);
    case "corner-br":   return rect(0.66, 0.66, 0.3, 0.3);
    case "full":
    default:
      return fullDefault ? rect(0, 0, 1, 1) : rect(0.1, 0.1, 0.8, 0.8);
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
