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
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  Scene,
  Widget,
  WidgetKind,
  WidgetPosition,
} from "@/lib/studio/editor-v2/canvas-state";
import { WIDGET_DRAG_MIME } from "./WidgetPalette";

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
}: CanvasStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

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
    if (!e.dataTransfer.types.includes(WIDGET_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!dragOver) setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    setDragOver(false);
    const kind = e.dataTransfer.getData(WIDGET_DRAG_MIME) as WidgetKind | "";
    if (!kind) return;
    e.preventDefault();
    const f = fractionFromEvent(e.clientX, e.clientY);
    if (!f) return;
    onWidgetDrop(kind, f);
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
      className={cn(
        "relative overflow-hidden shadow-lg outline-none",
        dragOver && "ring-2 ring-brand-purple ring-offset-2",
      )}
      style={{
        width: canvasWidth * zoom,
        height: canvasHeight * zoom,
        backgroundColor: scene.backgroundColor,
      }}
    >
      {scene.widgets.map((widget) => (
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
        />
      ))}
    </div>
  );
}

interface WidgetViewProps {
  widget: Widget;
  stageRef: React.RefObject<HTMLDivElement | null>;
  selected: boolean;
  onSelect: () => void;
  onMove: (position: WidgetPosition) => void;
}

function WidgetView({
  widget,
  stageRef,
  selected,
  onSelect,
  onMove,
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
      onMove({
        ...s.startPos,
        x: clamp01(s.startPos.x + dx),
        y: clamp01(s.startPos.y + dy),
      });
    } else {
      onMove({
        ...s.startPos,
        width: clampSize(s.startPos.width + dx),
        height: clampSize(s.startPos.height + dy),
      });
    }
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    const s = startRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    startRef.current = null;
  }

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
      className={cn(
        "absolute cursor-move select-none",
        selected && "outline outline-2 outline-brand-purple outline-offset-1",
      )}
      style={{
        left: `${widget.position.x * 100}%`,
        top: `${widget.position.y * 100}%`,
        width: `${widget.position.width * 100}%`,
        height: `${widget.position.height * 100}%`,
        zIndex: widget.position.z,
      }}
    >
      <WidgetBody widget={widget} />
      {selected && (
        <div
          onPointerDown={(e) => beginDrag(e, "resize")}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          className="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-sm bg-brand-purple"
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
            justifyContent:
              p.data.align === "center"
                ? "center"
                : p.data.align === "right"
                  ? "flex-end"
                  : "flex-start",
            background: p.data.background ?? "transparent",
            padding: p.data.background ? "0.25rem 0.5rem" : 0,
          }}
        >
          <span
            style={{
              fontSize: p.data.fontPx,
              color: p.data.color,
              fontWeight: p.data.fontWeight === "bold" ? 700 : 400,
              lineHeight: 1.1,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
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
  }
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

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampSize(v: number): number {
  return Math.max(0.02, Math.min(1, v));
}

