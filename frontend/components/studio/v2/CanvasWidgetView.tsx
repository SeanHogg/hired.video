/**
 * One widget on the canvas stage: its resolved frame (box, motion, effects,
 * container chrome — the same `resolveFrame` the export applies), its plugin
 * body (PluginWidgetBody, every kind), and in the edit canvas the shared
 * move / resize / rotate chrome (#1101 — `useTransformDrag` +
 * `<TransformChrome/>`, the primitive DrawingStage uses).
 *
 * `interactive=false` (playback, the watch page) renders a pure visual:
 * no pointer capture, no selection, no handles.
 */
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { normalizeRotationDegrees, type Widget, type WidgetPosition } from "@/lib/studio/editor-v2/canvas-state";
import type { AnimateInput } from "@/lib/timeline/effects/animate";
import { frameInputFromWidget, resolveFrame } from "@/lib/studio/widgets/frame";
import { frameToCss } from "@/lib/studio/widgets/frame-css";
import type { RenderContext } from "@/lib/studio/widgets/plugin";
import { pluginForWidgetKind } from "@/lib/studio/widgets/registry";
import PluginWidgetBody from "@/components/studio/widgets/PluginWidgetBody";
import { SELECTION_HALO, TransformChrome } from "./TransformHandles";
import { useTransformDrag, type TransformRect } from "./useTransformDrag";
import { clamp01 } from "@/lib/numeric";

export interface CanvasWidgetViewProps {
  widget: Widget;
  stageRef: React.RefObject<HTMLDivElement | null>;
  interactive: boolean;
  selected: boolean;
  onSelect: () => void;
  onMove: (position: WidgetPosition) => void;
  /** Clip-local time + duration. The edit canvas passes the authored start
   *  pose (clipTimeSec 0); playback passes the playhead-derived time. */
  animateInput: AnimateInput;
  projectId: string | null;
  canvasWidth: number;
  canvasHeight: number;
  render: RenderContext;
}

/** Smallest widget side, as a fraction of the canvas. */
const MIN_WIDGET_SIZE = 0.02;

/** Widgets keep their top-left on the canvas and never outgrow it. */
function clampToCanvas(r: TransformRect): TransformRect {
  return { ...r, x: clamp01(r.x), y: clamp01(r.y), width: Math.min(1, r.width), height: Math.min(1, r.height) };
}

export default function CanvasWidgetView({
  widget,
  stageRef,
  interactive,
  selected,
  onSelect,
  onMove,
  animateInput,
  projectId,
  canvasWidth,
  canvasHeight,
  render,
}: CanvasWidgetViewProps) {
  const { t } = useTranslation();
  const drag = useTransformDrag({
    rect: widget.position,
    stageWidth: 1,
    stageHeight: 1,
    getStageRect: () => stageRef.current?.getBoundingClientRect() ?? null,
    onChange: (next) => onMove({ ...widget.position, ...next, rotation: normalizeRotationDegrees(next.rotation) }),
    onStart: onSelect,
    clamp: clampToCanvas,
    minSize: MIN_WIDGET_SIZE,
  });

  // One resolved frame drives this box AND the exported frame (#2312).
  // Enter / exit motion plays only on playback — the edit canvas shows
  // every widget at rest. Transform keyframes still evaluate: clip-local
  // time plus visibleFrom recovers the scene playhead (#808 / #3160).
  const scenePlayheadSec = (widget.visibleFrom ?? 0) + animateInput.clipTimeSec;
  const input = frameInputFromWidget(widget, scenePlayheadSec);
  const canvas = { width: canvasWidth, height: canvasHeight };
  const frame = resolveFrame(interactive ? { ...input, motion: null } : input, canvas, animateInput);
  // The export clips the body to the rounded inner box only when the
  // chrome is rounded; a comic tail may reach outside a square box.
  const clipBody = (input.chrome?.borderRadius ?? 0) > 0;

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? t(pluginForWidgetKind(widget.params.kind).meta.labelKey) : undefined}
      onPointerDown={interactive ? (e) => drag.begin(e, "move") : undefined}
      onPointerMove={interactive ? drag.move : undefined}
      onPointerUp={interactive ? drag.end : undefined}
      onPointerCancel={interactive ? drag.end : undefined}
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
      style={{ ...frameToCss(frame), boxShadow: selected ? SELECTION_HALO : undefined }}
    >
      <div className={cn("relative h-full w-full", clipBody && "overflow-hidden")} style={{ borderRadius: "inherit" }}>
        <PluginWidgetBody
          params={widget.params}
          content={frame.content}
          canvas={canvas}
          render={render}
          clipTimeSec={animateInput.clipTimeSec}
          clipDurationSec={animateInput.clipDurationSec}
          isPlayback={!interactive}
          projectId={projectId}
        />
      </div>
      {interactive && selected && <TransformChrome drag={drag} />}
    </div>
  );
}
