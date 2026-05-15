/**
 * The canvas stage — the central "video frame" surface. Renders the
 * active scene with its widgets, accepts drops from the palette, and
 * handles widget select / move / resize.
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
import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ContainerStyle,
  Scene,
  Widget,
  WidgetAnimation,
  WidgetKind,
  WidgetPosition,
} from "@/lib/studio/editor-v2/canvas-state";
import { filtersToCss } from "@/lib/studio/video-filters";
import { fontFamilyFor } from "@/lib/studio/font-catalog";
import { motionStyleAt } from "@/lib/studio/editor-v2/widget-motion";
import {
  detectDragKind,
  hasRecognisedPayload,
  readDragPayload,
  type DragKind,
} from "@/lib/studio/editor-v2/drag-protocol";
import CanvasDropOverlay from "./CanvasDropOverlay";
import SceneBackgroundEffect from "@/components/studio/shared/SceneBackgroundEffect";

// ChartRenderer is heavy (chart-drawing primitives); only load when a
// chart widget is actually placed.
const ChartRenderer = lazy(
  () => import("@/components/studio/charts/ChartRenderer"),
);

export type Selection =
  | { kind: "scene"; sceneId: string }
  | { kind: "widget"; sceneId: string; widgetId: string };

export interface CanvasStageProps {
  scene: Scene;
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onWidgetDrop: (kind: WidgetKind, atFraction: { x: number; y: number }) => void;
  onWidgetMove: (widgetId: string, position: WidgetPosition) => void;
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
  /** Seconds elapsed into the active scene during playback. `null` means
   *  preview is paused — show every widget regardless of visibleFrom /
   *  visibleTo so the editor stays useful while authoring. */
  playheadInScene?: number | null;
  /** Project-level font (FontPreset.id). Applied to every text /
   *  heading widget body unless that widget overrides locally. */
  defaultFontId?: string | null;
}

export default function CanvasStage({
  scene,
  canvasWidth,
  canvasHeight,
  zoom,
  selection,
  onSelect,
  onWidgetDrop,
  onWidgetMove,
  onThemeDrop,
  onBackgroundDrop,
  onMediaDrop,
  playheadInScene,
  defaultFontId,
}: CanvasStageProps) {
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
    if (!hasRecognisedPayload(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const nextKind = detectDragKind(e.dataTransfer);
    // Set only when the kind changes to avoid re-rendering on every
    // dragover tick (which fires ~60Hz while the cursor moves).
    if (nextKind !== dragKind) setDragKind(nextKind);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragKind(null);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
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
        onWidgetDrop(payload.data as WidgetKind, f);
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
      case "font":
      case "music":
        // Targeted drops (font onto text widget / music onto timeline)
        // are gap-registered — the canvas isn't the right target for
        // those today.
        break;
    }
  }

  function handleBackgroundClick(e: React.MouseEvent | React.KeyboardEvent) {
    if (e.currentTarget !== e.target) return;
    onSelect({ kind: "scene", sceneId: scene.id });
  }

  return (
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
      className={cn("relative overflow-hidden shadow-lg outline-none")}
      style={{
        width: canvasWidth * zoom,
        height: canvasHeight * zoom,
        backgroundColor: scene.backgroundColor,
        // Per-scene colour grading — same filter math the render path
        // applies (lib/studio/video-filters.ts). Identity returns empty
        // string so the no-op case stays a no-op.
        filter: filtersToCss(scene.filters) || undefined,
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
        .filter((widget) => isWidgetVisibleAt(widget, playheadInScene))
        .map((widget) => (
          <WidgetView
            key={widget.id}
            widget={widget}
            stageRef={stageRef}
            selected={
              selection.kind === "widget" && selection.widgetId === widget.id
            }
            onSelect={() =>
              onSelect({ kind: "widget", sceneId: scene.id, widgetId: widget.id })
            }
            onMove={(position) => onWidgetMove(widget.id, position)}
            motion={
              playheadInScene !== null && playheadInScene !== undefined
                ? motionStyleAt(widget, playheadInScene, scene.durationSeconds)
                : null
            }
          />
        ))}
      {/* Drop-target chrome — kind-aware ring + centred badge. Self-
          gates: returns null when no drag is hovering, so we can mount
          it unconditionally. Filter is paused via the `filter: none`
          override so the overlay isn't tinted by the scene's colour
          grading (would obscure the label). */}
      <div className="pointer-events-none absolute inset-0" style={{ filter: "none" }}>
        <CanvasDropOverlay kind={dragKind} />
      </div>
    </div>
  );
}

interface WidgetViewProps {
  widget: Widget;
  stageRef: React.RefObject<HTMLDivElement | null>;
  selected: boolean;
  onSelect: () => void;
  onMove: (position: WidgetPosition) => void;
  /** Live motion style during playback. `null` when the editor is
   *  paused (the widget renders unanimated, in its authored pose). */
  motion: import("@/lib/studio/editor-v2/widget-motion").MotionStyle | null;
}

function WidgetView({
  widget,
  stageRef,
  selected,
  onSelect,
  onMove,
  motion,
}: WidgetViewProps) {
  const startRef = useRef<{
    pointerId: number;
    mode: "move" | "resize";
    startClientX: number;
    startClientY: number;
    startPos: WidgetPosition;
    stageRect: DOMRect;
  } | null>(null);

  function beginDrag(
    e: React.PointerEvent<HTMLDivElement>,
    mode: "move" | "resize",
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
  // Ken-Burns / pan animations apply to the inner body only — the
  // outer wrapper still owns selection chrome, position drags, and
  // motion enter/exit so the two animation systems compose without
  // fighting each other.
  const innerAnimation = animationFor(widget);
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => beginDrag(e, "move")}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className="absolute cursor-move select-none overflow-hidden"
      style={{
        left: `${widget.position.x * 100}%`,
        top: `${widget.position.y * 100}%`,
        width: `${widget.position.width * 100}%`,
        height: `${widget.position.height * 100}%`,
        zIndex: widget.position.z,
        // Motion transforms come on the LEFT so they apply in screen
        // space AFTER the widget's authored rotation — a slide-from-
        // left widget enters along the canvas X, not its own rotated
        // axis. Rotation stays on the right so the resize handle math
        // (which un-rotates pointer deltas) is unaffected.
        transform: composeTransform(motion?.transform, widget.position.rotation),
        transformOrigin: "center",
        opacity: motion ? motion.opacity : undefined,
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
        className="h-full w-full"
        style={{ ...innerAnimation, ...widgetEffectsToCss(widget.effects) }}
      >
        <WidgetBody widget={widget} />
      </div>
      {selected && (
        <div
          onPointerDown={(e) => beginDrag(e, "resize")}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          className="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-sm bg-brand-purple ring-2 ring-white"
          aria-label="Resize widget"
        />
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
  }
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
  };
}) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-lg p-4 text-center"
      style={{ backgroundColor: data.bgColor, color: data.textColor }}
    >
      <h2 className="text-lg font-bold leading-tight">{data.headline}</h2>
      {data.subheadline && (
        <p className="text-xs opacity-80">{data.subheadline}</p>
      )}
      <span
        className="inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold"
        style={{ backgroundColor: data.accentColor, color: data.accentTextColor }}
      >
        {data.ctaText || "Call to action"}
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

function VideoBody({ url, muted }: { url: string; muted: boolean }) {
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/40 text-xs text-muted-foreground">
        Drop video URL in properties
      </div>
    );
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
// side by the canvas-v2 appliers (#643). Returning the empty object
// short-circuits when the widget has no effects.
function widgetEffectsToCss(
  effects: ReadonlyArray<{ kind: string; params: Record<string, unknown> }> | undefined,
): React.CSSProperties {
  if (!effects || effects.length === 0) return {};
  const filters: string[] = [];
  let opacity: number | undefined;
  for (const eff of effects) {
    const p = eff.params ?? {};
    switch (eff.kind) {
      case "opacity": {
        const v = clamp01(numberParam(p.opacity, 1));
        if (v < 1) opacity = (opacity ?? 1) * v;
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
  const out: React.CSSProperties = {};
  if (filters.length > 0) out.filter = filters.join(" ");
  if (opacity !== undefined) out.opacity = opacity;
  return out;
}

function numberParam(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function animationFor(widget: Widget): React.CSSProperties {
  // Ken-Burns lives on image / video widget params. Other widget kinds
  // don't carry the field so we never render an animation for them.
  const kind: WidgetAnimation | undefined =
    widget.params.kind === "image" || widget.params.kind === "video"
      ? widget.params.data.animation
      : undefined;
  if (!kind || kind === "none") return {};
  // 12s animation-duration matches v1's Ken-Burns feel — long enough
  // to read as cinematic, short enough that the user notices it on a
  // short scene.
  const duration = "12s";
  switch (kind) {
    case "zoom-in":   return { animation: `studio-v2-zoom-in ${duration} ease-in-out infinite alternate` };
    case "zoom-out":  return { animation: `studio-v2-zoom-out ${duration} ease-in-out infinite alternate` };
    case "pan-left":  return { animation: `studio-v2-pan-left ${duration} ease-in-out infinite alternate` };
    case "pan-right": return { animation: `studio-v2-pan-right ${duration} ease-in-out infinite alternate` };
  }
}

function composeTransform(motionTransform: string | undefined, rotationDeg: number): string | undefined {
  const hasMotion = motionTransform !== undefined && motionTransform !== "none";
  const hasRotation = rotationDeg !== 0;
  if (!hasMotion && !hasRotation) return undefined;
  if (!hasMotion) return `rotate(${rotationDeg}deg)`;
  if (!hasRotation) return motionTransform;
  return `${motionTransform} rotate(${rotationDeg}deg)`;
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

// During authoring (playheadInScene === null) every widget is visible so
// the user can edit them. During playback (number) we honour the widget's
// visibleFrom / visibleTo window so the preview matches the rendered
// output. Single source of truth — both editor preview AND the eventual
// render path should resolve "is this widget visible at time t?" the
// same way (DRY).
function isWidgetVisibleAt(widget: Widget, playheadInScene: number | null | undefined): boolean {
  if (playheadInScene == null) return true;
  if (widget.visibleFrom != null && playheadInScene < widget.visibleFrom) return false;
  if (widget.visibleTo != null && playheadInScene > widget.visibleTo) return false;
  return true;
}

