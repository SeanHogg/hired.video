/**
 * Widget ⇄ overlay-clip projection (split out of timeline-emit.ts, #2312).
 * Each widget serializes to ONE ClipEffect on an overlay clip; its rect,
 * motion, chrome and effect chain ride beside the plugin's own params, and
 * the plugin registry owns every kind-specific field both ways.
 */
import type { Widget } from "./canvas-state";
import { isWidgetMotion } from "./widget-motion";
import { numberOr, parseContainerStyle, parseEffectStack } from "../widgets/frame";
import { parseWidgetKeyframes } from "../widgets/evaluate-widget-position";
import type { RenderContext } from "../widgets/plugin";
import { PROJECT_FONT_PARAM, pluginForEffectKind, pluginForWidgetKind } from "../widgets/registry";
import type { Clip, ClipEffect, Timeline } from "@shared/timeline";

export function widgetToClip(
  widget: Widget,
  sceneStart: number,
  sceneFrames: number,
  fps: number,
  render: Pick<RenderContext, "fontFamily">,
): Clip | null {
  const from = widget.visibleFrom !== null
    ? Math.max(0, Math.round(widget.visibleFrom * fps))
    : 0;
  const to = widget.visibleTo !== null
    ? Math.min(sceneFrames, Math.round(widget.visibleTo * fps))
    : sceneFrames;
  if (to <= from) return null;

  return {
    id: widget.id,
    sourceId: "",
    startFrame: sceneStart + from,
    durationFrames: to - from,
    sourceInFrame: 0,
    effects: [widgetToEffect(widget, render)],
  };
}

function widgetToEffect(widget: Widget, render: Pick<RenderContext, "fontFamily">): ClipEffect {
  const rect = {
    x: widget.position.x,
    y: widget.position.y,
    width: widget.position.width,
    height: widget.position.height,
    z: widget.position.z,
    rotation: widget.position.rotation,
    // Motion travels with the widget on the same effect so the renderer
    // can apply enter / exit to the clip's local timeline without a
    // second lookup. `null` means no motion (default).
    motion: widget.motion,
    // Container chrome (bg / border / radius / padding) — applied
    // uniformly across widget kinds. Omitted when the widget has no
    // styling so the persisted payload stays minimal.
    containerStyle: widget.containerStyle,
    // Per-widget visual effect chain (drop shadow, glow, blur, etc) —
    // same `{kind, params}` registry shape v1 uses on SceneEffect.
    effects: widget.effects,
    // Transform keyframes (#808). The static x/y/width/height/rotation
    // above stay the base pose for clip layout; the export painter
    // evaluates these at scene playhead via frameInputFromParams.
    // `keyframeOriginSec` is visibleFrom so clip-local time + origin
    // recovers scene seconds (atSec is authored from scene start).
    keyframes: widget.keyframes,
    keyframeOriginSec: widget.keyframes?.length ? (widget.visibleFrom ?? 0) : undefined,
  };
  const plugin = pluginForWidgetKind(widget.params.kind);
  return {
    kind: plugin.effectKind,
    params: { ...rect, [PROJECT_FONT_PARAM]: render.fontFamily, ...plugin.emit(widget.params) },
  };
}

export function clipToWidget(clip: Clip, sceneStart: number, fps: number): Widget | null {
  const effect = clip.effects?.[0];
  if (!effect?.kind.startsWith("canvas-v2:")) return null;
  const params = effect.params;

  const base: Pick<
    Widget,
    | "id"
    | "position"
    | "visibleFrom"
    | "visibleTo"
    | "motion"
    | "containerStyle"
    | "effects"
    | "keyframes"
  > = {
    id: clip.id,
    position: {
      x: numberOr(params.x, 0.1),
      y: numberOr(params.y, 0.1),
      width: numberOr(params.width, 0.3),
      height: numberOr(params.height, 0.1),
      z: numberOr(params.z, 1),
      rotation: numberOr(params.rotation, 0),
    },
    visibleFrom: (clip.startFrame - sceneStart) / fps,
    visibleTo: (clip.startFrame - sceneStart + clip.durationFrames) / fps,
    motion: isWidgetMotion(params.motion) ? params.motion : null,
    containerStyle: parseContainerStyle(params.containerStyle) ?? undefined,
    effects: Array.isArray(params.effects) ? parseEffectStack(params.effects) : undefined,
    keyframes: parseWidgetKeyframes(params.keyframes),
  };

  const plugin = pluginForEffectKind(effect.kind);
  if (!plugin) return null;
  const widgetParams = plugin.parse(params);
  return {
    ...base,
    // Pre-#659 image / video saves carried Ken Burns as `params.animation`.
    effects: liftLegacyAnimation(params, base.effects),
    kind: widgetParams.kind,
    params: widgetParams,
  };
}

/** Lift the legacy `params.animation` Ken-Burns prop (image/video
 *  only, pre-gap-#659 saves) into the modern `effects` chain as an
 *  `animate-*` entry. Single seam called by the image/video hydration
 *  paths so render-side, editor preview, and legacy data all converge
 *  on the same effect-array representation — no parallel motion paths.
 *
 *  If the chain already has an animate-* effect, the legacy prop is
 *  ignored: explicit user choice wins over the legacy shortcut. */
function liftLegacyAnimation(
  params: Record<string, unknown>,
  existing: Array<{ kind: string; params: Record<string, unknown> }> | undefined,
): Array<{ kind: string; params: Record<string, unknown> }> | undefined {
  const legacy = typeof params.animation === "string" ? params.animation : "";
  if (legacy === "" || legacy === "none") return existing;
  const allowed = new Set(["zoom-in", "zoom-out", "pan-left", "pan-right"]);
  if (!allowed.has(legacy)) return existing;
  const kind = `animate-${legacy}`;
  const arr = existing ? existing.slice() : [];
  if (arr.some((e) => e.kind === kind)) return existing;
  arr.unshift({ kind, params: {} });
  return arr;
}

export function isWidget(value: Widget | null): value is Widget {
  return value !== null;
}

/** Every widget overlay clip on a saved Timeline, in paint order. */
export function collectWidgetClips(timeline: Timeline): Clip[] {
  // Widgets live on the `v2` track — one track for every overlay clip
  // in the composition. Paint order = clip-array order, baked in by
  // `canvasStateToTimeline` (which sorts by z before emit). The
  // renderer iterates every active clip on `v2` per frame via
  // `activeClipsAt`, so simultaneous widgets all draw.
  //
  // Stored timelines authored between #832 and the unification used
  // one dedicated `widget-<id>` track per widget. Migration 0096
  // folds those back into v2 server-side, but until it runs in a
  // given environment the JS reader normalises the input shape on
  // the fly: any `widget-<id>` track's clips merge into `widgetClips`.
  // First save after load re-emits as the canonical v2 shape, so data
  // converges with or without the SQL migration.
  //
  // Dedup by clip.id is load-bearing: if a project's timeline_spec
  // carries BOTH a v2 track AND `widget-<id>` tracks (transition-
  // window layered saves, or an interrupted migration), the same
  // widget id can appear twice — once on v2 and once on its dedicated
  // widget track. Without dedup the canvas paints that widget twice
  // (e.g. a duplicate heading or a stray shape that shouldn't be
  // there). The first occurrence wins so v2-track ordering is honoured
  // when it exists.
  const v2 = timeline.tracks.find((t) => t.id === "v2" && t.kind === "video");
  const legacyWidgetTrackClips = timeline.tracks
    .filter((t) => t.kind === "video" && t.id.startsWith("widget-"))
    .flatMap((t) => t.clips);
  const seenClipIds = new Set<string>();
  const widgetClips: Clip[] = [];
  const dedupePush = (clip: Clip) => {
    if (seenClipIds.has(clip.id)) return;
    seenClipIds.add(clip.id);
    widgetClips.push(clip);
  };
  for (const c of v2?.clips ?? []) dedupePush(c);
  const sortedLegacy = legacyWidgetTrackClips.slice().sort((a, b) => {
    const az = Number(a.effects?.[0]?.params?.z ?? 1);
    const bz = Number(b.effects?.[0]?.params?.z ?? 1);
    return (Number.isFinite(az) ? az : 1) - (Number.isFinite(bz) ? bz : 1);
  });
  for (const c of sortedLegacy) dedupePush(c);
  return widgetClips;
}
