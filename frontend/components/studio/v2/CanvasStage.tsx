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
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  normalizeRotationDegrees,
  resolveCtaFontSizes,
  type ChromaKeyParams,
  type ContainerStyle,
  type Scene,
  type Widget,
  type WidgetKind,
  type WidgetPosition,
} from "@/lib/studio/editor-v2/canvas-state";
import { applyChromaKeyToPixels } from "@/lib/studio/chroma-key";
import { filtersToCss } from "@/lib/studio/video-filters";
import { fontFamilyFor } from "@/lib/studio/font-catalog";
import {
  computeAnimateOutput,
  type AnimateInput,
} from "@/lib/timeline/effects/animate";
import {
  detectDragKind,
  hasRecognisedPayload,
  readDragPayload,
  type DragKind,
} from "@/lib/studio/editor-v2/drag-protocol";
import {
  parseLinkedContentRef,
  type LinkedContentKind,
} from "@/lib/studio/editor-v2/linked-content";
import CanvasDropOverlay from "./CanvasDropOverlay";
import LinkedContentBody from "./LinkedContentBody";
import SafeZoneOverlay from "./SafeZoneOverlay";
import SceneBackgroundEffect from "@/components/studio/shared/SceneBackgroundEffect";

// ChartRenderer is heavy (chart-drawing primitives); only load when a
// chart widget is actually placed.
const ChartRenderer = lazy(
  () => import("@/components/studio/charts/ChartRenderer"),
);

export type Selection =
  | { kind: "scene"; sceneId: string }
  | { kind: "widget"; sceneId: string; widgetId: string };

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
  /** Screenshot drag-drop → drop point is remembered, then the parent
   *  opens the display-media picker; the captured frame becomes an
   *  Image widget at `atFraction`. The drop carries no payload of its
   *  own (the picker can't be invoked from inside a sync drop handler),
   *  so this is purely "place here when capture finishes". */
  onScreenshotDrop?: (atFraction: { x: number; y: number }) => void;
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
  onScreenshotDrop,
  defaultFontId,
}: CanvasStageProps) {
  const isPlayback = mode === "playback";
  const stageRef = useRef<HTMLDivElement>(null);
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
      case "screenshot":
        // The picker can't open synchronously inside a drop handler in
        // any browser, so we just record the drop point and let the
        // parent run the async capture/upload then place the image.
        onScreenshotDrop?.(f);
        break;
      case "font":
      case "music":
        // Targeted drops (font onto text widget / music onto timeline)
        // are gap-registered — the canvas isn't the right target for
        // those today.
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
          fontFamily: fontFamilyFor(defaultFontId),
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
            <WidgetView
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

interface WidgetViewProps {
  widget: Widget;
  stageRef: React.RefObject<HTMLDivElement | null>;
  /** When false, the widget renders as a pure visual element — no
   *  pointer-event capture, no selection ring, no resize handles, no
   *  move/resize/rotate drag logic. Playback callers pass false so the
   *  same component that powers the editor also powers `/v/<id>` and
   *  the editor's play-mode preview without any "is this clickable?"
   *  branching at the parent. */
  interactive: boolean;
  selected: boolean;
  onSelect: () => void;
  onMove: (position: WidgetPosition) => void;
  /** Clip-local time + duration in seconds. `clipTimeSec=0` in edit
   *  mode (authored start pose); playback callers pass the real
   *  playhead-derived time so animate-* effects run live. */
  animateInput: AnimateInput;
}

function WidgetView({
  widget,
  stageRef,
  interactive,
  selected,
  onSelect,
  onMove,
  animateInput,
}: WidgetViewProps) {
  const startRef = useRef<{
    pointerId: number;
    mode: "move" | "resize" | "rotate";
    startClientX: number;
    startClientY: number;
    startPos: WidgetPosition;
    stageRect: DOMRect;
  } | null>(null);

  function beginDrag(
    e: React.PointerEvent<HTMLDivElement>,
    mode: "move" | "resize" | "rotate",
  ) {
    const stage = stageRef.current;
    if (!stage) return;
    e.stopPropagation();
    onSelect();
    (e.target as Element).setPointerCapture(e.pointerId);
    startRef.current = {
      pointerId: e.pointerId,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPos: { ...widget.position },
      stageRect: stage.getBoundingClientRect(),
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const s = startRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    const dx = (e.clientX - s.startClientX) / s.stageRect.width;
    const dy = (e.clientY - s.startClientY) / s.stageRect.height;
    if (s.mode === "move") {
      // CSS transform rotates around the widget's own centre, so screen-space
      // translation of the unrotated (left,top) anchor moves the rotated
      // visual by exactly (dx,dy) — no un-rotation needed here.
      onMove({
        ...s.startPos,
        x: clamp01(s.startPos.x + dx),
        y: clamp01(s.startPos.y + dy),
      });
    } else if (s.mode === "rotate") {
      // Angle from the widget's screen-space centre to the pointer. Diff
      // against the start angle so the widget's existing rotation is
      // preserved when the drag begins from any handle position.
      const cx = s.stageRect.left + (s.startPos.x + s.startPos.width / 2) * s.stageRect.width;
      const cy = s.stageRect.top + (s.startPos.y + s.startPos.height / 2) * s.stageRect.height;
      const startAngle = Math.atan2(s.startClientY - cy, s.startClientX - cx);
      const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
      const deltaDeg = ((currentAngle - startAngle) * 180) / Math.PI;
      onMove({
        ...s.startPos,
        rotation: normalizeRotationDegrees(s.startPos.rotation + deltaDeg),
      });
    } else {
      // Resize: the bottom-right handle is the local bottom-right corner of
      // the widget, but its screen-space position is rotated. Un-rotate the
      // pointer delta into the widget's local frame so dragging the handle
      // grows width/height along the widget's own axes (matches how every
      // other canvas tool behaves when rotated).
      const local = unrotateDelta(dx, dy, s.startPos.rotation);
      onMove({
        ...s.startPos,
        width: clampSize(s.startPos.width + local.dx),
        height: clampSize(s.startPos.height + local.dy),
      });
    }
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    const s = startRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    startRef.current = null;
  }

  const containerCss = containerStyleToCss(widget.containerStyle);
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onPointerDown={interactive ? (e) => beginDrag(e, "move") : undefined}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerUp={interactive ? endDrag : undefined}
      onPointerCancel={interactive ? endDrag : undefined}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onSelect();
            }
          : undefined
      }
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      className={cn("absolute select-none", interactive ? "cursor-move" : "pointer-events-none")}
      style={{
        left: `${widget.position.x * 100}%`,
        top: `${widget.position.y * 100}%`,
        width: `${widget.position.width * 100}%`,
        height: `${widget.position.height * 100}%`,
        zIndex: widget.position.z,
        // Rotation is the only authored transform — motion / animate
        // effects only render visibly on the playback canvas, not in
        // the edit canvas.
        transform: widget.position.rotation !== 0
          ? `rotate(${widget.position.rotation}deg)`
          : undefined,
        transformOrigin: "center",
        // Selection chrome — double-stroke (white halo + brand-purple
        // ring) so it stays visible regardless of scene background.
        // A flat brand-coloured outline disappears on purple/dark
        // backgrounds; box-shadow gives us a halo without needing a
        // theme-aware colour lookup.
        boxShadow: selected
          ? "0 0 0 2px #ffffff, 0 0 0 4px hsl(var(--brand-purple))"
          : undefined,
        ...containerCss,
      }}
    >
      <div
        className="h-full w-full overflow-hidden"
        style={widgetEffectsToCss(widget.effects, animateInput)}
      >
        <WidgetBody widget={widget} />
      </div>
      {interactive && selected && (
        <div
          onPointerDown={(e) => beginDrag(e, "resize")}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          className="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-sm bg-brand-purple ring-2 ring-white"
          aria-label="Resize widget"
        />
      )}
      {interactive && selected && (
        <>
          {/* Stick — decorative line from the widget's top-left corner
              out to the rotation ball. transformOrigin "top center" +
              rotate(225deg) makes a thin vertical rectangle anchored at
              (0,0) extend up-and-to-the-left toward the ball. */}
          <div
            aria-hidden
            className="pointer-events-none absolute bg-brand-purple"
            style={{
              left: -1,
              top: 0,
              width: 2,
              height: 22,
              transformOrigin: "top center",
              transform: "rotate(225deg)",
            }}
          />
          <div
            onPointerDown={(e) => beginDrag(e, "rotate")}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute h-3 w-3 cursor-grab rounded-full bg-brand-purple ring-2 ring-white"
            style={{ left: -19, top: -19 }}
            aria-label="Rotate widget"
          />
        </>
      )}
    </div>
  );
}

function WidgetBody({ widget }: { widget: Widget }) {
  const p = widget.params;
  switch (p.kind) {
    case "text":
    case "heading": {
      return (
        <div
          className="flex h-full w-full items-center"
          style={{
            background: p.data.background ?? "transparent",
            padding: p.data.background ? "0.25rem 0.5rem" : 0,
          }}
        >
          <span
            style={{
              display: "block",
              width: "100%",
              fontSize: p.data.fontPx,
              color: p.data.color,
              fontWeight: p.data.fontWeight === "bold" ? 700 : 400,
              lineHeight: 1.1,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              textAlign: p.data.align,
            }}
          >
            {p.data.text}
          </span>
        </div>
      );
    }
    case "image":
      return (
        <ImageBody
          url={p.data.source.kind === "url" ? p.data.source.url : ""}
          fit={p.data.fit}
        />
      );
    case "video":
      return (
        <VideoBody
          url={p.data.source.kind === "url" ? p.data.source.url : ""}
          muted={p.data.muted}
          chromaKey={p.data.chromaKey ?? null}
        />
      );
    case "shape-rect":
      return (
        <div
          className="h-full w-full"
          style={{
            backgroundColor: p.data.fill,
            border:
              p.data.strokeWidth > 0
                ? `${p.data.strokeWidth}px solid ${p.data.strokeColor}`
                : "none",
            borderRadius: p.data.cornerRadius,
          }}
        />
      );
    case "shape-circle":
      return (
        <div
          className="h-full w-full"
          style={{
            backgroundColor: p.data.fill,
            border:
              p.data.strokeWidth > 0
                ? `${p.data.strokeWidth}px solid ${p.data.strokeColor}`
                : "none",
            borderRadius: "50%",
          }}
        />
      );
    case "divider":
      return (
        <div className="flex h-full w-full items-center">
          <div
            className="w-full"
            style={{
              borderTop: `${p.data.thickness}px solid ${p.data.color}`,
            }}
          />
        </div>
      );
    case "chart":
      return (
        <Suspense
          fallback={
            <div className="flex h-full w-full items-center justify-center bg-muted/40 text-xs text-muted-foreground">
              Loading chart…
            </div>
          }
        >
          <ChartRenderer
            chartType={p.data.chartType}
            data={p.data.data}
            format={p.data.format}
            colors={p.data.colors}
            title={p.data.title}
            takeaway={p.data.takeaway}
            className="h-full w-full"
          />
        </Suspense>
      );
    case "webcam":
      return <WebcamBody url={p.data.recordingUrl ?? ""} mirror={!!p.data.mirror} muted={!!p.data.muted} />;
    case "chips":
      return <ChipsBody data={p.data} />;
    case "cta":
      return <CtaBody data={p.data} />;
    case "linked-content":
      return <LinkedContentBody data={p.data} />;
    case "speech-bubble":
      return <SpeechBubbleBody data={p.data} />;
    case "caption-box":
      return <CaptionBoxBody data={p.data} />;
    case "sfx-burst":
      return <SfxBurstBody data={p.data} />;
  }
}

// ─── Comic widget bodies ─────────────────────────────────────────────────────
//
// Bubble + SFX shapes are rendered as inline SVG so the editor preview
// can show the exact strokes / fills that the (future) canvas-2D
// applier paints at export. The SVG viewBox is 100x100 and is stretched
// to the widget's bounding box via `preserveAspectRatio="none"` — same
// pattern v1 uses for shape primitives. Tail geometry is computed once
// here from the bubble's bounding box + the canvas-fraction anchor, so
// dragging either the bubble or the speaker keeps the pointer aimed.
//
// `containerStyle` is intentionally not honoured for these kinds —
// they ARE the container chrome (the bubble IS the panel of dialogue).
// If a user wants a backdrop they can stack a `shape-rect` underneath.

function SpeechBubbleBody({
  data,
}: {
  data: {
    text: string;
    fontPx: number;
    fontFamily?: string;
    color: string;
    bgColor: string;
    strokeColor: string;
    strokeWidth: number;
    shape: "speech" | "thought" | "shout" | "whisper";
    tail: { anchorX: number; anchorY: number } | null;
  };
}) {
  const stroke = data.strokeColor;
  const fill = data.bgColor;
  const sw = data.strokeWidth;
  // Path table — every shape ships its outline as a single SVG `d`
  // string so the renderer (and the export pipeline) read one source.
  const outline = (() => {
    switch (data.shape) {
      case "speech":
        // Rounded ovoid bubble, inset 4px from the viewBox so the
        // stroke isn't clipped at the bounding box edge.
        return "M 50,4 C 75,4 96,18 96,40 C 96,62 75,76 50,76 C 35,76 22,72 14,64 L 14,82 L 30,70 C 36,74 42,76 50,76";
      case "thought":
        // Cloud-shaped bubble with three trailing puffs at the bottom
        // (smaller circles drawn separately below).
        return "M 50,8 C 70,8 84,18 84,30 C 92,32 96,40 96,50 C 96,64 82,72 70,70 C 66,80 56,84 46,82 C 38,90 24,86 22,76 C 8,76 6,60 14,52 C 8,42 14,28 26,28 C 28,16 40,8 50,8 Z";
      case "shout":
        // Jagged starburst outline — 16 alternating peaks/troughs.
        return "M 50,2 L 56,12 L 68,8 L 64,20 L 78,18 L 70,28 L 84,32 L 74,40 L 88,46 L 76,52 L 86,62 L 74,64 L 82,76 L 70,72 L 72,86 L 60,78 L 58,92 L 48,82 L 42,94 L 36,82 L 26,90 L 26,76 L 14,80 L 18,68 L 6,64 L 14,56 L 4,48 L 14,42 L 6,32 L 18,30 L 12,18 L 24,20 L 24,8 L 36,14 L 40,2 Z";
      case "whisper":
        return "M 50,4 C 75,4 96,18 96,40 C 96,62 75,76 50,76 C 25,76 4,62 4,40 C 4,18 25,4 50,4 Z";
    }
  })();
  // Tail geometry — tip points toward the speaker; base sits on the
  // bubble's outline. When `tail` is null we render no tail (caption-
  // style balloon).
  const tail = data.tail;
  return (
    <div
      className="relative h-full w-full"
      style={{ fontFamily: data.fontFamily }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
      >
        <path
          d={outline}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
          strokeDasharray={data.shape === "whisper" ? `${sw * 2} ${sw * 2}` : undefined}
        />
        {data.shape === "thought" && (
          // Trailing puffs lead from the bubble toward the speaker.
          <>
            <circle cx="30" cy="92" r="4" fill={fill} stroke={stroke} strokeWidth={sw} />
            <circle cx="22" cy="98" r="2.5" fill={fill} stroke={stroke} strokeWidth={sw} />
          </>
        )}
      </svg>
      {/* Tail — only on speech/shout/whisper. Thought uses puffs above. */}
      {tail && data.shape !== "thought" && (
        <SpeechTail
          anchorX={tail.anchorX}
          anchorY={tail.anchorY}
          bubbleFill={fill}
          bubbleStroke={stroke}
          strokeWidth={sw}
        />
      )}
      <div
        className="absolute inset-0 flex items-center justify-center px-4 text-center"
        style={{
          fontSize: data.fontPx,
          color: data.color,
          lineHeight: 1.2,
          fontStyle: data.shape === "thought" ? "italic" : "normal",
          wordBreak: "break-word",
        }}
      >
        {data.text}
      </div>
    </div>
  );
}

/** The pointer triangle from a speech bubble toward a canvas-fractional
 *  anchor. Drawn in a parent-positioned `<svg>` that overflows the
 *  bubble's bounding box so the tail tip can reach beyond the box. */
function SpeechTail({
  anchorX,
  anchorY,
  bubbleFill,
  bubbleStroke,
  strokeWidth,
}: {
  anchorX: number;
  anchorY: number;
  bubbleFill: string;
  bubbleStroke: string;
  strokeWidth: number;
}) {
  // The tail's tip is at the canvas-fractional anchor; the base is on
  // the underside of the bubble (y ≈ 80% of the bubble height).
  // Since this SVG is inside the bubble's box and the anchor is in
  // canvas coords, we can't position by absolute math here without
  // knowing the canvas dims. Render the tail as a triangle whose tip
  // sits 30px below the bubble in the bubble's local coord system —
  // the inspector lets the author drag the tail anchor and that drags
  // the bubble OR the anchor; until the canvas-2D applier ships, this
  // simplified tail is the editor-preview affordance.
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      style={{
        position: "absolute",
        bottom: -32,
        left: "30%",
        overflow: "visible",
        pointerEvents: "none",
      }}
      aria-hidden="true"
      data-anchor-x={anchorX}
      data-anchor-y={anchorY}
    >
      <polygon
        points="0,0 20,32 18,0"
        fill={bubbleFill}
        stroke={bubbleStroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Mask the join line where the tail meets the bubble */}
      <line x1="-1" y1="0" x2="19" y2="0" stroke={bubbleFill} strokeWidth={strokeWidth + 1} />
    </svg>
  );
}

function CaptionBoxBody({
  data,
}: {
  data: {
    text: string;
    fontPx: number;
    fontFamily?: string;
    color: string;
    bgColor: string;
    strokeColor: string;
    strokeWidth: number;
    italic: boolean;
  };
}) {
  return (
    <div
      className="flex h-full w-full items-center px-3"
      style={{
        backgroundColor: data.bgColor,
        border: `${data.strokeWidth}px solid ${data.strokeColor}`,
        fontFamily: data.fontFamily,
        color: data.color,
        fontSize: data.fontPx,
        fontStyle: data.italic ? "italic" : "normal",
        lineHeight: 1.2,
        letterSpacing: data.italic ? 0 : 0.5,
      }}
    >
      <span style={{ width: "100%" }}>{data.text}</span>
    </div>
  );
}

function SfxBurstBody({
  data,
}: {
  data: {
    text: string;
    fontPx: number;
    fontFamily?: string;
    color: string;
    bgColor: string;
    strokeColor: string;
    strokeWidth: number;
    shape: "star" | "jagged" | "circle-jagged" | "lightning";
  };
}) {
  const outline = (() => {
    switch (data.shape) {
      case "star":
        // 10-point star inscribed in the 100x100 viewBox.
        return "M 50,2 L 60,38 L 98,38 L 68,60 L 78,96 L 50,74 L 22,96 L 32,60 L 2,38 L 40,38 Z";
      case "jagged":
        return "M 50,2 L 58,18 L 76,8 L 70,26 L 92,30 L 78,44 L 96,56 L 78,62 L 90,80 L 70,76 L 72,96 L 56,82 L 50,98 L 44,82 L 28,96 L 30,76 L 10,80 L 22,62 L 4,56 L 22,44 L 8,30 L 30,26 L 24,8 L 42,18 Z";
      case "circle-jagged":
        return "M 50,4 L 60,10 L 70,6 L 76,16 L 88,18 L 90,30 L 96,40 L 90,52 L 96,64 L 84,72 L 80,84 L 68,84 L 58,94 L 48,86 L 38,96 L 28,86 L 16,88 L 12,76 L 4,68 L 10,56 L 4,44 L 12,32 L 8,20 L 22,18 L 28,8 L 40,12 Z";
      case "lightning":
        return "M 50,2 L 30,42 L 50,42 L 28,98 L 78,40 L 56,40 L 76,2 Z";
    }
  })();
  return (
    <div className="relative h-full w-full" style={{ fontFamily: data.fontFamily }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <path
          d={outline}
          fill={data.bgColor}
          stroke={data.strokeColor}
          strokeWidth={data.strokeWidth}
          strokeLinejoin="round"
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center text-center font-extrabold uppercase"
        style={{
          fontSize: data.fontPx,
          color: data.color,
          textShadow: `2px 2px 0 ${data.strokeColor}`,
          letterSpacing: 1,
          padding: "10%",
        }}
      >
        {data.text}
      </div>
    </div>
  );
}

function CtaBody({
  data,
}: {
  data: {
    headline: string;
    subheadline?: string;
    ctaText: string;
    ctaUrl: string;
    bgColor: string;
    textColor: string;
    accentColor: string;
    accentTextColor: string;
    cardFontPx?: number;
    ctaFontPx?: number;
  };
}) {
  const buttonLabel = data.ctaText || "Call to action";
  // Resolved via the canvas-state helper so the DOM preview and the
  // canvas pixel renderer share one font-size policy (incl. the
  // subheadline-derivation ratio + back-compat defaults for CTAs
  // authored before these fields existed).
  const sizes = resolveCtaFontSizes(data.cardFontPx, data.ctaFontPx);
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-lg p-4 text-center"
      style={{ backgroundColor: data.bgColor, color: data.textColor }}
    >
      <h2 className="font-bold leading-tight" style={{ fontSize: sizes.headline }}>
        {data.headline}
      </h2>
      {data.subheadline && (
        <p className="opacity-80" style={{ fontSize: sizes.subheadline }}>
          {data.subheadline}
        </p>
      )}
      <span
        className="inline-flex items-center rounded-full px-4 py-1.5 font-semibold"
        style={{
          backgroundColor: data.accentColor,
          color: data.accentTextColor,
          fontSize: sizes.button,
        }}
      >
        {buttonLabel}
      </span>
    </div>
  );
}

function ChipsBody({
  data,
}: {
  data: {
    chips: string[];
    fontPx: number;
    fontFamily?: string;
    chipColor: string;
    textColor: string;
    direction: "row" | "column";
  };
}) {
  return (
    <div
      className={
        data.direction === "column"
          ? "flex h-full w-full flex-col items-start gap-1.5"
          : "flex h-full w-full flex-wrap items-center gap-1.5"
      }
      style={{ fontFamily: data.fontFamily, fontSize: `${data.fontPx}px` }}
    >
      {data.chips.map((chip, i) => (
        <span
          key={`${chip}-${i}`}
          className="rounded-full px-2.5 py-0.5"
          style={{ backgroundColor: data.chipColor, color: data.textColor }}
        >
          {chip}
        </span>
      ))}
    </div>
  );
}

function WebcamBody({ url, mirror, muted }: { url: string; mirror: boolean; muted: boolean }) {
  if (!url) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted/40 text-[10px] text-muted-foreground">
        <Camera className="h-5 w-5" />
        <span>Webcam placeholder</span>
      </div>
    );
  }
  return (
    <video
      src={url}
      muted={muted}
      className="h-full w-full object-cover"
      style={mirror ? { transform: "scaleX(-1)" } : undefined}
      playsInline
      controls={false}
    />
  );
}

function ImageBody({ url, fit }: { url: string; fit: "cover" | "contain" | "stretch" }) {
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/40 text-xs text-muted-foreground">
        Drop image URL in properties
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      className="h-full w-full"
      style={{ objectFit: fit === "stretch" ? "fill" : fit }}
    />
  );
}

function VideoBody({
  url,
  muted,
  chromaKey,
}: {
  url: string;
  muted: boolean;
  chromaKey: ChromaKeyParams | null;
}) {
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/40 text-xs text-muted-foreground">
        Drop video URL in properties
      </div>
    );
  }
  // Self-gate: a video without a chroma config renders through the
  // plain <video> element (GPU-decoded, zero work). The keyed path
  // only kicks in when the user has actually configured chromaKey, so
  // every existing video widget continues at its current cost.
  if (chromaKey) {
    return <ChromaVideoBody url={url} muted={muted} chromaKey={chromaKey} />;
  }
  return (
    <video
      src={url}
      muted={muted}
      className="h-full w-full object-cover"
      playsInline
      controls={false}
    />
  );
}

/** Editor-preview video body with chroma-key applied. Drives a hidden
 *  <video> + visible <canvas>; on every RAF tick, snapshots the video
 *  frame to the canvas, runs `applyChromaKeyToPixels` (same math the
 *  registered effect uses), and blits the keyed frame for display.
 *
 *  Self-gating per DRY: the parent VideoBody decides whether to mount
 *  this; this component just paints. No conditional path inside that
 *  the consumer could compute itself. */
function ChromaVideoBody({
  url,
  muted,
  chromaKey,
}: {
  url: string;
  muted: boolean;
  chromaKey: ChromaKeyParams;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Stable per-render snapshot — the RAF loop closes over `chromaKey`
  // via this ref so the effect dep list doesn't have to re-mount the
  // loop every time the user nudges a slider.
  const paramsRef = useRef(chromaKey);
  useEffect(() => {
    paramsRef.current = chromaKey;
  }, [chromaKey]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    let raf = 0;
    let cancelled = false;
    function tick() {
      if (cancelled || !video || !canvas) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      // Wait for metadata before we have meaningful dims to paint into.
      if (w > 0 && h > 0) {
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          try {
            ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            applyChromaKeyToPixels(img.data, paramsRef.current);
            ctx.putImageData(img, 0, 0);
          } catch {
            // Cross-origin video blocks getImageData. The plain <video>
            // is hidden behind the canvas, so falling through here just
            // shows the canvas frame from before the taint — acceptable
            // for the editor preview.
          }
        }
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [url]);

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        src={url}
        muted={muted}
        crossOrigin="anonymous"
        autoPlay
        loop
        playsInline
        controls={false}
        style={{ position: "absolute", inset: 0, visibility: "hidden" }}
      />
      <canvas ref={canvasRef} className="h-full w-full object-cover" />
    </div>
  );
}

function containerStyleToCss(cs: ContainerStyle | undefined): React.CSSProperties {
  if (!cs) return {};
  const out: React.CSSProperties = {};
  if (cs.backgroundColor) out.backgroundColor = cs.backgroundColor;
  if (cs.borderColor && cs.borderWidth) {
    out.border = `${cs.borderWidth}px solid ${cs.borderColor}`;
  } else if (cs.borderColor && !cs.borderWidth) {
    out.border = `2px solid ${cs.borderColor}`;
  }
  if (cs.borderRadius) out.borderRadius = cs.borderRadius;
  if (cs.padding) out.padding = cs.padding;
  return out;
}

// Translate the per-widget effect stack into CSS the DOM preview can
// render. Only kinds with a natural CSS equivalent map; full-frame
// pixel ops (film-grain, vignette, glitch, chromatic-aberration,
// sharpen, lut, curves, …) are skipped here and re-applied render-
// side by the canvas-v2 appliers (#643).
//
// Animate-* effects fold in via the shared `computeAnimateOutput`
// math (same definition the canvas renderer uses), translated into
// CSS transform / opacity here. One math source → editor preview ===
// render-side pixels (gap #659 closure).
function widgetEffectsToCss(
  effects: ReadonlyArray<{ kind: string; params: Record<string, unknown> }> | undefined,
  animateInput: AnimateInput,
): React.CSSProperties {
  const out: React.CSSProperties = {};
  if (!effects || effects.length === 0) return out;

  const filters: string[] = [];
  let opacity = 1;
  let opacitySet = false;
  for (const eff of effects) {
    const p = eff.params ?? {};
    switch (eff.kind) {
      case "opacity": {
        const v = clamp01(numberParam(p.opacity, 1));
        if (v < 1) {
          opacity *= v;
          opacitySet = true;
        }
        break;
      }
      case "blur": {
        const v = clamp01(numberParam(p.intensity, 0));
        if (v > 0) filters.push(`blur(${Math.round(v * 24)}px)`);
        break;
      }
      case "glow": {
        const v = clamp01(numberParam(p.intensity, 0));
        if (v > 0) {
          const radius = Math.round(8 + v * 24);
          const alpha = (0.4 + v * 0.4).toFixed(2);
          filters.push(`drop-shadow(0 0 ${radius}px rgba(255,255,255,${alpha}))`);
        }
        break;
      }
      default:
        // Kinds without a CSS analogue ride along in the saved data
        // and are picked up by the export-side applier.
        break;
    }
  }
  // Compose animate output as CSS transform. tx/ty are fractions of
  // widget own width/height — translated to `%` units which CSS scales
  // against the element box exactly the same way.
  const animate = computeAnimateOutput(effects, animateInput);
  const transformParts: string[] = [];
  if (animate.tx !== 0 || animate.ty !== 0) {
    transformParts.push(`translate(${(animate.tx * 100).toFixed(2)}%, ${(animate.ty * 100).toFixed(2)}%)`);
  }
  if (animate.scale !== 1) {
    transformParts.push(`scale(${animate.scale.toFixed(4)})`);
  }
  if (animate.alpha < 1) {
    opacity *= animate.alpha;
    opacitySet = true;
  }
  if (filters.length > 0) out.filter = filters.join(" ");
  if (transformParts.length > 0) out.transform = transformParts.join(" ");
  if (opacitySet) out.opacity = opacity;
  return out;
}

/**
 * Derive the clip-local time the animate math needs from the parent's
 * playhead position. Honours `visibleFrom` / `visibleTo` so a widget
 * with a sub-scene visibility window animates relative to its own
 * lifespan (matches what the renderer does — each widget compiles to
 * its own clip whose duration is `visibleTo - visibleFrom`).
 */
/**
 * Build the AnimateInput for a widget at the current playhead position.
 *
 * - `currentTimeSec === undefined` → edit mode. Returns the authored
 *   START pose (clipTimeSec = 0) so animate-* effects render their
 *   first frame (e.g. fade-in shows the pre-fade pose, zoom-in shows
 *   the start scale).
 * - `currentTimeSec` set → playback. Returns clipTimeSec relative to
 *   the widget's `visibleFrom`, clamped to [0, lifespan] so the
 *   animation plays once per visibility window.
 */
function widgetAnimateInputForPlayhead(
  widget: Widget,
  sceneDurationSeconds: number,
  currentTimeSec: number | undefined,
): AnimateInput {
  const from = widget.visibleFrom ?? 0;
  const to = widget.visibleTo ?? sceneDurationSeconds;
  const lifespan = Math.max(0, to - from);
  if (currentTimeSec === undefined) {
    return { clipTimeSec: 0, clipDurationSec: lifespan };
  }
  const clipTimeSec = Math.max(0, Math.min(lifespan, currentTimeSec - from));
  return { clipTimeSec, clipDurationSec: lifespan };
}

/**
 * Decide whether a widget should be on-screen at the current scene
 * playhead. Edit mode (no currentTimeSec) renders every widget — the
 * author needs to see all of them to lay out the scene. Playback mode
 * gates each widget against its [visibleFrom, visibleTo) window so a
 * widget that hasn't entered yet (or has already exited) drops out.
 */
function isWidgetVisibleAt(
  widget: Widget,
  sceneDurationSeconds: number,
  currentTimeSec: number | undefined,
): boolean {
  if (currentTimeSec === undefined) return true;
  const from = widget.visibleFrom ?? 0;
  const to = widget.visibleTo ?? sceneDurationSeconds;
  return currentTimeSec >= from && currentTimeSec < to;
}

function numberParam(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

// Scene-level effects → CSS filter string for the editor preview. Only
// the CSS-mappable subset is approximated here; full-frame pixel ops
// (film-grain, glitch, vignette, chromatic-aberration, sharpen) need
// the export compositor and are skipped — they ride along in the data
// (#655 remaining) so the next export pass picks them up.
function sceneEffectsToCss(
  effects: ReadonlyArray<{ kind: string; params: Record<string, unknown> }> | undefined,
): string {
  if (!effects || effects.length === 0) return "";
  const parts: string[] = [];
  for (const e of effects) {
    const p = e.params ?? {};
    switch (e.kind) {
      case "blur": {
        const v = clamp01(numberParam(p.intensity, 0));
        if (v > 0) parts.push(`blur(${Math.round(v * 24)}px)`);
        break;
      }
      case "glow": {
        const v = clamp01(numberParam(p.intensity, 0));
        if (v > 0) {
          const radius = Math.round(8 + v * 24);
          const alpha = (0.4 + v * 0.4).toFixed(2);
          parts.push(`drop-shadow(0 0 ${radius}px rgba(255,255,255,${alpha}))`);
        }
        break;
      }
      default:
        break;
    }
  }
  return parts.join(" ");
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampSize(v: number): number {
  return Math.max(0.02, Math.min(1, v));
}

// Inverse 2D rotation of a screen-space delta into the widget's local frame.
// Used by the resize handle so a rotated widget grows along its own axes.
function unrotateDelta(dx: number, dy: number, rotationDeg: number): {
  dx: number;
  dy: number;
} {
  if (!rotationDeg) return { dx, dy };
  const r = (-rotationDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { dx: cos * dx - sin * dy, dy: sin * dx + cos * dy };
}

