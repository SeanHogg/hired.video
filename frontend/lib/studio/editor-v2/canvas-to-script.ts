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
 *   - Voiceover clips ride along as scene-level overlays on whichever
 *     scene they anchor to (best-effort — multi-clip voice is gap-
 *     registered for full audio mixing).
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
  TextElement,
  ImageElement,
  VideoElement,
  ChipsElement,
  ChartElement,
  WebcamElement,
  ImageAnimation,
  AudioElement,
} from "@/types/video-script";
import type {
  CanvasState,
  ContainerStyle,
  Scene,
  Widget,
} from "./canvas-state";

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

  let cursor = 0;
  const scenes: SceneScript[] = state.scenes.map((scene, idx) => {
    const start = cursor;
    cursor += scene.durationSeconds;
    return sceneToSceneScript(scene, state, idx, start);
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
      audio: state.musicSource
        ? {
            track:
              state.musicSource.kind === "stock"
                ? state.musicSource.trackId
                : "custom",
            label:
              state.musicSource.kind === "stock"
                ? state.musicSource.trackId
                : state.musicSource.label,
            volume: 0.6,
          }
        : undefined,
    },
    scenes,
  };
}

function sceneToSceneScript(
  scene: Scene,
  state: CanvasState,
  idx: number,
  start: number,
): SceneScript {
  // Anchor voiceovers to the scene — populate sceneAudio so v1's
  // compiler stitches the URL onto the timeline.
  const vo = state.voiceovers.find((v) => v.anchorSceneId === scene.id);
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
    accentColor: scene.backgroundColor,
    sceneElements: scene.widgets
      .map(widgetToElement)
      .filter((e): e is SceneElement => e !== null),
    sceneAudio: vo?.url,
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
  const box = positionToBox(widget.position);
  const style = containerStyleToElementStyle(widget.containerStyle);
  const z = widget.position.z;
  const rotation = widget.position.rotation;
  switch (widget.params.kind) {
    case "text":
    case "heading": {
      const t: TextElement = {
        id: widget.id,
        kind: "text",
        text: widget.params.data.text,
        box,
        fontSize: widget.params.data.fontPx,
        fontWeight: widget.params.data.fontWeight,
        color: widget.params.data.color,
        align: widget.params.data.align,
        style,
        z,
        rotation,
      };
      return t;
    }
    case "image": {
      const im: ImageElement = {
        id: widget.id,
        kind: "image",
        url:
          widget.params.data.source.kind === "url"
            ? widget.params.data.source.url
            : "",
        box,
        fit: widget.params.data.fit === "stretch" ? "fill" : widget.params.data.fit,
        animation: effectsToImageAnimation(widget.effects),
        style,
        z,
        rotation,
      };
      return im;
    }
    case "video": {
      const v: VideoElement = {
        id: widget.id,
        kind: "video",
        url:
          widget.params.data.source.kind === "url"
            ? widget.params.data.source.url
            : "",
        box,
        muted: widget.params.data.muted,
        style,
        z,
        rotation,
      };
      return v;
    }
    case "chart": {
      const c: ChartElement = {
        id: widget.id,
        kind: "chart",
        chartType: widget.params.data.chartType,
        data: widget.params.data.data,
        format: widget.params.data.format,
        title: widget.params.data.title,
        takeaway: widget.params.data.takeaway,
        colors: widget.params.data.colors,
        box,
        style,
        z,
        rotation,
      };
      return c;
    }
    case "webcam": {
      const w: WebcamElement = {
        id: widget.id,
        kind: "webcam",
        recordingUrl: widget.params.data.recordingUrl ?? null,
        mirror: widget.params.data.mirror,
        muted: widget.params.data.muted,
        box,
        style,
        z,
        rotation,
      };
      return w;
    }
    case "chips": {
      const c: ChipsElement = {
        id: widget.id,
        kind: "chips",
        chips: widget.params.data.chips,
        fontSize: widget.params.data.fontPx,
        fontFamily: widget.params.data.fontFamily,
        chipColor: widget.params.data.chipColor,
        textColor: widget.params.data.textColor,
        direction: widget.params.data.direction,
        box,
        style,
        z,
        rotation,
      };
      return c;
    }
    case "cta":
      // The CTA widget's data already rides on the scene envelope
      // (ctaText + ctaUrl + the "cta" scene type) via `sceneToSceneScript`.
      // No matching SceneElement kind, so don't double-emit here — v1's
      // render path picks the CTA up from the scene-level fields.
      return null;
    case "linked-content":
      // v1's SceneElement union has no entity-card equivalent. Drop the
      // widget from the v1-emit path — the canvas + render-side v2
      // applier (once it lands; gap-registered) is the source of truth
      // for how linked content paints.
      return null;
    case "shape-rect":
    case "shape-circle":
    case "divider":
      // v1's SceneElement union doesn't have shape primitives — encode
      // them as a styled text element with no text. Keeps the box +
      // bg/border + radius visible in v1's render path. Gap-registered.
      return {
        id: widget.id,
        kind: "text",
        text: "",
        box,
        style: {
          ...style,
          backgroundColor:
            widget.params.kind === "divider"
              ? widget.params.data.color
              : widget.params.data.fill,
          borderColor:
            widget.params.kind !== "divider" && widget.params.data.strokeColor
              ? widget.params.data.strokeColor
              : style?.borderColor,
          borderWidth:
            widget.params.kind !== "divider" && widget.params.data.strokeWidth
              ? widget.params.data.strokeWidth
              : style?.borderWidth,
          borderRadius:
            widget.params.kind === "shape-circle"
              ? Math.max(box.w, box.h) * 5
              : widget.params.kind === "shape-rect"
                ? widget.params.data.cornerRadius
                : style?.borderRadius,
        },
        z,
        rotation,
      } as TextElement;
  }
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

/** Reverse of `ken_burnsToEffects` in `script-to-canvas.ts`: when a V2
 *  widget carries a V1-compatible `animate-zoom-*` / `animate-pan-*`
 *  effect, surface it back as the V1 `imageAnimation` field. Other
 *  modern animate kinds (fade, pulse, shake) have no V1 equivalent so
 *  they're written only on the effects array — V1 ignores them.
 *  Round-trip is lossless for the four kinds V1 knows about. */
function effectsToImageAnimation(
  effects: Widget["effects"],
): ImageAnimation | undefined {
  if (!effects) return "none";
  const known: ReadonlySet<string> = new Set([
    "animate-zoom-in",
    "animate-zoom-out",
    "animate-pan-left",
    "animate-pan-right",
  ]);
  for (const e of effects) {
    if (known.has(e.kind)) {
      return e.kind.slice("animate-".length) as ImageAnimation;
    }
  }
  return "none";
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
