/**
 * The canvas stage — the central "video frame" surface. ONE renderer
 * used by every screen surface: editor edit mode, editor play mode,
 * the public watch page (`/v/<id>`), and the marketplace template
 * player. Export-to-WebM keeps `renderTimelineFrame` (canvas-2D) for
 * the headless encoding loop where there's no DOM available.
 *
 * Two modes:
 *   - `mode="edit"` (default): selection chrome + drag/drop targets +
 *     resize handles live. Widget animate effects render their authored
 *     START pose (clipTimeSec=0) so the author sees the pre-fade /
 *     pre-zoom layout.
 *   - `mode="playback"`: `currentTimeSec` gates widget visibility against
 *     each widget's `visibleFrom`/`visibleTo` window, animate effects
 *     run at the real clip-local time, and edit chrome is suppressed.
 *     The drag/drop handlers + onSelect prop are optional in this mode.
 *
 * Selection semantics (edit mode):
 *
 * Selection semantics:
 *   - Click an empty area of the canvas → frame selection (right panel
 *     shows scene settings).
 *   - Click a widget → widget selection (right panel shows widget
 *     config). Click again on canvas background to deselect.
 *
 * All position math is fractional (0..1 of canvas dims) so widgets
 * survive zoom and resolution changes without re-mapping pixels.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Selection } from "@/lib/studio/editor-v2/editor-types";
import type { Scene, WidgetKind, WidgetPosition } from "@/lib/studio/editor-v2/canvas-state";
import { filtersToCss } from "@/lib/studio/video-filters";
import { fontFamilyFor } from "@/lib/studio/font-catalog";
import type { RenderContext } from "@/lib/studio/widgets/plugin";
import {
  detectDragKind,
  hasRecognisedPayload,
  readDragPayload,
  type DragKind,
  type DragPayload,
} from "@/lib/studio/editor-v2/drag-protocol";
import {
  parseLinkedContentRef,
  type LinkedContentKind,
} from "@/lib/studio/editor-v2/linked-content";
import {
  parseEngagementAssetRef,
  type EngagementAssetKind,
} from "@/lib/studio/editor-v2/engagement-assets";
import CanvasDropOverlay from "./CanvasDropOverlay";
import CanvasWidgetView from "./CanvasWidgetView";
import SafeZoneOverlay from "./SafeZoneOverlay";
import SceneBackgroundEffect from "@/components/studio/shared/SceneBackgroundEffect";
import {
  clamp01,
  isWidgetVisibleAt,
  sceneEffectsToCss,
  widgetAnimateInputForPlayhead,
} from "./canvas-stage-helpers";

// The selection type is plain editor data (lib); re-exported for the
// importers that still read it from here.
export type { Selection };

export type CanvasStageMode = "edit" | "playback";

export interface CanvasStageProps {
  scene: Scene;
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
  /** Defaults to "edit". In "playback" mode, edit chrome (selection
   *  outlines, resize handles, drop overlays) is suppressed and widget
   *  visibility is gated against `currentTimeSec`. */
  mode?: CanvasStageMode;
  /** Seconds elapsed in the active scene. Required for playback mode;
   *  ignored in edit mode (which always shows the authored start
   *  pose). When set, animate-* effects run at the real clip-local
   *  time and widgets outside their `visibleFrom`/`visibleTo` window
   *  drop out of the render. */
  currentTimeSec?: number;
  /** Edit-mode selection. In playback mode pass a scene-level selection
   *  with no widget selected — never renders any chrome. */
  selection: Selection;
  /** Edit-mode handlers. Optional so playback callers can mount the
   *  same component without supplying no-op stubs. The component
   *  treats absent handlers as a hard "no edits allowed" gate. */
  onSelect?: (selection: Selection) => void;
  onWidgetDrop?: (kind: WidgetKind, atFraction: { x: number; y: number }) => void;
  onWidgetMove?: (widgetId: string, position: WidgetPosition) => void;
  /** Theme drag-drop → apply visual theme to whole composition. */
  onThemeDrop?: (themeId: string) => void;
  /** Background drag-drop → apply preset to active scene. */
  onBackgroundDrop?: (bgValue: string) => void;
  /** Media URL drag-drop → drop as Image / Video widget at the drop
   *  fraction. mediaType picks image vs video. */
  onMediaDrop?: (
    url: string,
    mediaType: "image" | "video",
    atFraction: { x: number; y: number },
  ) => void;
  /** Linked-content drag-drop → drop a card preview of a user-owned
   *  entity (resume / job / future kinds) at the drop fraction. */
  onLinkedContentDrop?: (
    entityKind: LinkedContentKind,
    entityId: string,
    atFraction: { x: number; y: number },
  ) => void;
  /** Engagement-asset drag-drop → drop a card preview of a per-project
   *  authored engagement artifact (form / chapter / thumbnail / review)
   *  at the drop fraction. The body needs `projectId` to self-fetch. */
  onEngagementAssetDrop?: (
    assetKind: EngagementAssetKind,
    assetId: string,
    atFraction: { x: number; y: number },
  ) => void;
  /** Active project id — threaded down to engagement-asset widget
   *  bodies so they can self-fetch their bound artifact. `null` for
   *  unsaved compositions; the body renders an empty state. */
  projectId?: string | null;
  /** Screenshot drag-drop → drop point is remembered, then the parent
   *  opens the display-media picker; the captured frame becomes an
   *  Image widget at `atFraction`. The drop carries no payload of its
   *  own (the picker can't be invoked from inside a sync drop handler),
   *  so this is purely "place here when capture finishes". */
  onScreenshotDrop?: (atFraction: { x: number; y: number }) => void;
  /** A music track was dropped onto the canvas → add it as a music audio
   *  layer (multi-track audio). The drop point is irrelevant for audio
   *  (it's composition-wide), so this just receives the drag payload. */
  onMusicDrop?: (payload: DragPayload) => void;
  /** Project-level font (FontPreset.id). Applied to every text /
   *  heading widget body unless that widget overrides locally. */
  defaultFontId?: string | null;
}

export default function CanvasStage({
  scene,
  canvasWidth,
  canvasHeight,
  zoom,
  mode = "edit",
  currentTimeSec,
  selection,
  onSelect,
  onWidgetDrop,
  onWidgetMove,
  onThemeDrop,
  onBackgroundDrop,
  onMediaDrop,
  onLinkedContentDrop,
  onEngagementAssetDrop,
  onScreenshotDrop,
  onMusicDrop,
  defaultFontId,
  projectId,
}: CanvasStageProps) {
  const isPlayback = mode === "playback";
  const stageRef = useRef<HTMLDivElement>(null);
  const fontFamily = fontFamilyFor(defaultFontId);
  // Same project values the export painter reads off each clip. The stage
  // is always interactive: the playback overlay makes CTAs clickable.
  const render = useMemo<RenderContext>(() => ({ fontFamily, target: "interactive" }), [fontFamily]);
  // `dragKind` is null when no recognised drag is hovering. We track
  // the kind (not just a boolean) so the kind-aware drop overlay can
  // show the correct label + accent colour — single source of truth
  // sits in the shared `DRAG_KIND_META` catalog.
  const [dragKind, setDragKind] = useState<DragKind | null>(null);

  const fractionFromEvent = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const el = stageRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      return { x: clamp01(x), y: clamp01(y) };
    },
    [],
  );

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (isPlayback) return;
    if (!hasRecognisedPayload(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const nextKind = detectDragKind(e.dataTransfer);
    // Set only when the kind changes to avoid re-rendering on every
    // dragover tick (which fires ~60Hz while the cursor moves).
    if (nextKind !== dragKind) setDragKind(nextKind);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (isPlayback) return;
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragKind(null);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    if (isPlayback) return;
    setDragKind(null);
    const payload = readDragPayload(e.dataTransfer);
    if (!payload) return;
    e.preventDefault();
    const f = fractionFromEvent(e.clientX, e.clientY);
    if (!f) return;
    // Single dispatch point — every drag kind handled here, not in
    // per-source pickers (DRY).
    switch (payload.kind) {
      case "widget":
        onWidgetDrop?.(payload.data as WidgetKind, f);
        break;
      case "theme":
        onThemeDrop?.(payload.data);
        break;
      case "background":
        onBackgroundDrop?.(payload.data);
        break;
      case "media-url":
        onMediaDrop?.(payload.data, payload.mediaType ?? "image", f);
        break;
      case "linked-content": {
        const ref = parseLinkedContentRef(payload.data);
        if (ref) onLinkedContentDrop?.(ref.kind, ref.id, f);
        break;
      }
      case "engagement-asset": {
        const ref = parseEngagementAssetRef(payload.data);
        if (ref) onEngagementAssetDrop?.(ref.kind, ref.id, f);
        break;
      }
      case "screenshot":
        // The picker can't open synchronously inside a drop handler in
        // any browser, so we just record the drop point and let the
        // parent run the async capture/upload then place the image.
        onScreenshotDrop?.(f);
        break;
      case "music":
        // Dropping a music track on the canvas adds a composition-wide
        // music layer (multi-track audio). The drop point is irrelevant.
        onMusicDrop?.(payload);
        break;
      case "font":
        // Targeted font-onto-text-widget drops are gap-registered — the
        // canvas isn't the right target for those today.
        break;
    }
  }

  function handleBackgroundClick(e: React.MouseEvent | React.KeyboardEvent) {
    if (isPlayback) return;
    if (e.currentTarget !== e.target) return;
    onSelect?.({ kind: "scene", sceneId: scene.id });
  }

  // Zoom is applied via CSS transform on the inner stage (sized at the
  // native canvas dims) so EVERY pixel-fixed style inside — text fontSize,
  // shape strokes, chip padding, divider thickness, CTA Tailwind classes —
  // scales uniformly with the surrounding fractional widget boxes. The
  // outer wrapper claims the visual size for layout / centring; the inner
  // div is the interactive surface (`stageRef`) whose `getBoundingClientRect()`
  // reports the scaled visual box, so drag / drop / resize math (which is
  // already fraction-based) stays correct without any per-widget changes.
  return (
    <div
      data-doc-surface
      className="relative overflow-hidden shadow-lg"
      style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}
    >
      <div
        ref={stageRef}
        role="application"
        aria-label={`Canvas for ${scene.label}`}
        tabIndex={0}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleBackgroundClick}
        onKeyDown={(e) => {
          if (e.key === "Escape") handleBackgroundClick(e);
        }}
        className={cn("absolute left-0 top-0 outline-none")}
        style={{
          width: canvasWidth,
          height: canvasHeight,
          transform: `scale(${zoom})`,
          transformOrigin: "top left",
          backgroundColor: scene.backgroundColor,
          // Compose colour-grading filters (lib/studio/video-filters.ts)
          // with scene-effects-derived CSS filters (blur intensity) so
          // the preview at least HINTS at what the export will paint.
          // Pixel-faithful parity for stylize / vignette / film-grain
          // still requires the export-side compositor (#655).
          filter:
            [filtersToCss(scene.filters), sceneEffectsToCss(scene.effects)]
              .filter(Boolean)
              .join(" ") || undefined,
          fontFamily,
        }}
      >
        {/* Encoded-preset overlay — gradient / dark-tech-grid / particles
            paint OVER the flat `backgroundColor` so the bg-color colour
            picker still acts as the solid-fallback. Self-gates: returns
            null for solid / undefined, so it costs nothing when unused. */}
        <SceneBackgroundEffect
          effect={scene.backgroundEffect}
          baseColor={scene.backgroundColor}
        />
        {scene.widgets
          .filter((widget) => isWidgetVisibleAt(widget, scene.durationSeconds, isPlayback ? currentTimeSec : undefined))
          .map((widget) => (
            <CanvasWidgetView
              key={widget.id}
              widget={widget}
              stageRef={stageRef}
              interactive={!isPlayback}
              selected={
                !isPlayback &&
                selection.kind === "widget" &&
                selection.widgetId === widget.id
              }
              onSelect={() =>
                onSelect?.({ kind: "widget", sceneId: scene.id, widgetId: widget.id })
              }
              onMove={(position) => onWidgetMove?.(widget.id, position)}
              animateInput={widgetAnimateInputForPlayhead(
                widget,
                scene.durationSeconds,
                isPlayback ? currentTimeSec : undefined,
              )}
              projectId={projectId ?? null}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              render={render}
            />
          ))}
        {/* Safe-zone overlay — dashed bands marking destination-specific
            safe areas (TikTok/Reels caption band, SMPTE action-safe,
            outdoor billboard bleed). Self-gates: returns null in playback
            mode (the guide is an editor-only affordance) and when the
            active format has no `safeZones` declared, so it costs nothing
            on classic 16:9 / 1:1 / 4:3 formats. */}
        <SafeZoneOverlay
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          mode={mode}
        />
      </div>
      {/* Drop-target chrome — kind-aware ring + centred badge. Self-
          gates: returns null when no drag is hovering. Lives OUTSIDE the
          scaled stage so its label stays readable at low zoom (would be
          tiny / pixellated if scaled along with the canvas). */}
      <div className="pointer-events-none absolute inset-0">
        <CanvasDropOverlay kind={dragKind} />
      </div>
    </div>
  );
}
