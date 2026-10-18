/**
 * Convert v2 `CanvasState` into v1 `VideoScript` so the v2 editor can
 * piggyback on v1's `compile() → exportVideo()` render pipeline (which
 * already handles WebCodecs / ffmpeg.wasm / MediaRecorder / watermark /
 * Pro-codec gating / audio mixing). Avoids forking a parallel renderer
 * just to ship v2 export — single source of truth for "how does a
 * composition become an MP4?" stays in v1's renderer.
 *
 * Mapping:
 *   - Every widget → one `SceneElement` on the v1 scene's `sceneElements`
 *     array (free-form mode). v1's compiler already renders sceneElements
 *     with absolute positioning so widget layouts survive.
 *   - Widget `containerStyle` → `ElementStyle` (same shape; just
 *     re-keyed to ElementStyle).
 *   - Image / video `animation` → v1's `ImageAnimation` Ken-Burns enum.
 *   - Widget `motion` is NOT translated yet (v1's animation system is
 *     per-element via `animation` field, not the v2 enter/exit motion
 *     model — gap #595). Tracked separately.
 *   - `containerStyle.padding`, `chart`/`webcam` widget kinds, and
 *     non-Ken-Burns animations pass through directly because v1's
 *     SceneElement union already supports them.
 *   - Voiceover audio layers ride along as scene-level overlays on
 *     whichever scene they anchor to (best-effort — multi-clip voice is
 *     gap-registered for full audio mixing).
 *
 * Per the DRY rule: every v2→render path goes through this function.
 * No consumer hand-rolls the conversion.
 */
import type {
  VideoScript,
  SceneScript,
  SceneElement,
  ElementBox,
  ElementStyle,
  AudioElement,
} from "@/types/video-script";
import {
  musicLayers,
  voiceoverLayers,
  type CanvasState,
  type ContainerStyle,
  type Scene,
  type Widget,
} from "./canvas-state";
import { widgetParamsToScriptElement } from "./widget-kinds/registry";

export interface CanvasToScriptOptions {
  /** Total composition duration override (seconds). Defaults to the sum
   *  of scene durations. */
  totalDurationOverride?: number;
}

export function canvasStateToScript(
  state: CanvasState,
  options: CanvasToScriptOptions = {},
): VideoScript {
  const fps = state.fps;
  const aspect = aspectFor(state.width, state.height);
  const resolution = resolutionFor(state.height);

  // Voiceover layers anchor scene-level audio; the first music layer (if
  // any) drives v1's single `audio.track` field.
  const voiceovers = voiceoverLayers(state);
  const firstMusic = musicLayers(state)[0] ?? null;

  let cursor = 0;
  const scenes: SceneScript[] = state.scenes.map((scene, idx) => {
    const start = cursor;
    cursor += scene.durationSeconds;
    return sceneToSceneScript(scene, voiceovers, state, idx, start);
  });

  const total = options.totalDurationOverride ?? cursor;

  return {
    video: {
      duration: total,
      fps,
      resolution,
      aspect,
      theme: {
        colorPalette: state.colorPalette
          ? Array.from(state.colorPalette)
          : ["#0f172a", "#a78bfa", "#ffffff", "#ffffff"],
        fontFamily: state.fontFamily ?? "Inter",
        motion: "moderate",
        transition: "fade",
        background: "solid",
        filters: state.scenes[0]?.filters
          ? canvasFiltersToScript(state.scenes[0].filters)
          : undefined,
      },
      audio: firstMusic
        ? {
            track:
              firstMusic.source.kind === "stock"
                ? firstMusic.source.trackId
                : "custom",
            label:
              firstMusic.source.kind === "stock"
                ? firstMusic.source.trackId
                : firstMusic.label,
            volume: 0.6,
          }
        : undefined,
    },
    scenes,
  };
}

function sceneToSceneScript(
  scene: Scene,
  voiceovers: ReadonlyArray<CanvasState["audioLayers"][number]>,
  state: CanvasState,
  idx: number,
  start: number,
): SceneScript {
  // Anchor voiceover layers to the scene — populate sceneAudio so v1's
  // compiler stitches the URL onto the timeline.
  const vo = voiceovers.find((v) => v.anchorSceneId === scene.id);
  const voUrl = vo?.source.kind === "custom" ? vo.source.url : undefined;
  // CTA widgets are first-class in v2 but v1 represents the CTA on the
  // scene envelope (`ctaText` + the storyboard's `ctaUrl`). Emit the
  // first CTA widget back at scene scope so the v1 render path can
  // still draw the button (gap #616).
  const ctaWidget = scene.widgets.find((w) => w.params.kind === "cta");
  const cta =
    ctaWidget && ctaWidget.params.kind === "cta"
      ? {
          ctaText: ctaWidget.params.data.ctaText,
          ctaUrl: ctaWidget.params.data.ctaUrl,
        }
      : null;
  // Preserve v1-only scene fields when present so a v1-imported project
  // emits with its original metadata intact (gap #611). Fall back to
  // the index heuristic only when no source type was recorded.
  const sceneType: SceneScript["type"] =
    scene.sourceSceneType ??
    (idx === 0 ? "intro" : idx === state.scenes.length - 1 ? "closing" : "achievement");
  const animation = scene.sourceEnterAnimations
    ? {
        titleEnter: scene.sourceEnterAnimations.titleEnter,
        subtitleEnter: scene.sourceEnterAnimations.subtitleEnter,
        textEnter: scene.sourceEnterAnimations.textEnter,
      }
    : undefined;
  return {
    id: scene.id,
    start,
    duration: scene.durationSeconds,
    type: cta ? "cta" : sceneType,
    // The chip / rail name survives the round trip (#2349).
    ...(scene.label ? { label: scene.label } : {}),
    accentColor: scene.backgroundColor,
    ...(scene.backgroundEffect ? { backgroundEffect: scene.backgroundEffect } : {}),
    sceneElements: scene.widgets
      .map(widgetToElement)
      .filter((e): e is SceneElement => e !== null),
    sceneAudio: voUrl,
    sceneAudioLabel: vo?.label,
    ...(animation ? { animation } : {}),
    ...(scene.effects && scene.effects.length > 0 ? { effects: scene.effects } : {}),
    ...(scene.transitionIn ? { transitionIn: scene.transitionIn } : {}),
    ...(cta?.ctaText ? { ctaText: cta.ctaText } : {}),
    // ctaUrl lives on the storyboard's SceneScript type at the wider
    // schema level (see studio.ts StoryboardSceneSchema). Forward it
    // through as a passthrough field so v1's render path picks it up.
    ...(cta?.ctaUrl ? ({ ctaUrl: cta.ctaUrl } as Record<string, unknown>) : {}),
  } as SceneScript;
}

function widgetToElement(widget: Widget): SceneElement | null {
  const el = widgetToElementBody(widget);
  if (!el) return null;
  // Timing round-trips with the element (see script-to-canvas withElementTiming).
  return {
    ...el,
    ...(widget.visibleFrom && widget.visibleFrom > 0 ? { appearAt: widget.visibleFrom } : {}),
    ...(widget.motion ? { motion: widget.motion } : {}),
  };
}

function widgetToElementBody(widget: Widget): SceneElement | null {
  const box = positionToBox(widget.position);
  const style = containerStyleToElementStyle(widget.containerStyle);
  // The per-kind v1 element (or null when v1 has no equivalent) is
  // `toScriptElement` on the widget-kind registry — one entry per kind.
  return widgetParamsToScriptElement(widget.params, {
    widget,
    box,
    style,
    z: widget.position.z,
    rotation: widget.position.rotation,
  });
}

function positionToBox(p: Widget["position"]): ElementBox {
  return {
    x: p.x * 100,
    y: p.y * 100,
    w: p.width * 100,
    h: p.height * 100,
  };
}

function containerStyleToElementStyle(
  cs: ContainerStyle | undefined,
): ElementStyle | undefined {
  if (!cs) return undefined;
  const out: ElementStyle = {};
  if (cs.backgroundColor !== undefined) out.backgroundColor = cs.backgroundColor;
  if (cs.borderColor !== undefined) out.borderColor = cs.borderColor;
  if (cs.borderWidth !== undefined) out.borderWidth = cs.borderWidth;
  if (cs.borderRadius !== undefined) out.borderRadius = cs.borderRadius;
  if (cs.padding !== undefined) out.padding = cs.padding;
  return Object.keys(out).length === 0 ? undefined : out;
}

function canvasFiltersToScript(
  f: NonNullable<CanvasState["scenes"][number]["filters"]>,
): import("@/types/video-script").VideoFilters {
  return {
    brightness: f.brightness,
    contrast: f.contrast,
    saturation: f.saturation,
    hueRotate: f.hue,
    blur: f.blur,
    warmth: f.warmth * 100,
  };
}

function aspectFor(w: number, h: number): VideoScript["video"]["aspect"] {
  if (w === h) return "1:1";
  if (w > h && w / h >= 1.7) return "16:9";
  if (w < h) return "9:16";
  return "4:3";
}

function resolutionFor(h: number): VideoScript["video"]["resolution"] {
  if (h >= 2160) return "4k";
  if (h >= 1080) return "1080p";
  return "720p";
}

// Mark AudioElement as imported to keep TS happy when the type is only
// used through SceneElement union — kept narrow so future audio-element
// porting has a stub to land on.
type _Audio = AudioElement;
