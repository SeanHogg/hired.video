/**
 * TransformHandles — the ONE selection chrome for "a thing on a canvas the
 * user can move, resize or rotate" (#1101): a halo, a bottom-right resize
 * handle and a rotation ball on a stick above the top centre. The gesture
 * math is `useTransformDrag`.
 *
 *   - `<TransformChrome/>` — just the handles, for a host that already owns
 *     the positioned box (CanvasStage's widget frame, which also carries
 *     motion, effects and container chrome).
 *   - `<TransformHandles/>` (default) — a positioned box + the chrome, for a
 *     host that only has a rect (DrawingStage's Hand-tool selection).
 *
 * Coordinates: `rect` is in STAGE units (`stageWidth` × `stageHeight`).
 */
import { useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useTransformDrag, type TransformDrag, type TransformRect, type UseTransformDragOptions } from "./useTransformDrag";

export type { TransformRect } from "./useTransformDrag";

/** Double stroke (white halo + brand ring) — visible on any background. */
export const SELECTION_HALO = "0 0 0 2px #ffffff, 0 0 0 4px hsl(var(--brand-primary))";

/** Resize + rotate handles. Render inside the (rotated) box they control. */
export function TransformChrome({ drag }: { drag: TransformDrag }) {
  const { t } = useTranslation();
  const handlers = (mode: "resize" | "rotate") => ({
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => drag.begin(e, mode),
    onPointerMove: drag.move,
    onPointerUp: drag.end,
    onPointerCancel: drag.end,
  });
  return (
    <>
      <div
        {...handlers("resize")}
        role="button"
        aria-label={t("studio.transform.resize")}
        className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm bg-brand-primary ring-2 ring-white"
      />
      <div aria-hidden className="pointer-events-none absolute -top-6 left-1/2 h-6 w-px -translate-x-1/2 bg-brand-primary" />
      <div
        {...handlers("rotate")}
        role="button"
        aria-label={t("studio.transform.rotate")}
        className="absolute -top-8 left-1/2 h-3 w-3 -translate-x-1/2 cursor-grab rounded-full bg-brand-primary ring-2 ring-white"
      />
    </>
  );
}

interface TransformHandlesProps extends Pick<UseTransformDragOptions, "rect" | "stageWidth" | "stageHeight" | "onChange" | "onCommit" | "clamp"> {
  /** Hides the handles + halo when false. The box stays the drag-to-move
   *  surface. */
  selected: boolean;
  className?: string;
}

export default function TransformHandles({ rect, stageWidth, stageHeight, onChange, onCommit, selected, className, clamp }: TransformHandlesProps) {
  const { t } = useTranslation();
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useTransformDrag({
    rect,
    stageWidth,
    stageHeight,
    getStageRect: () => boxRef.current?.parentElement?.getBoundingClientRect() ?? null,
    onChange,
    onCommit,
    clamp,
  });
  const style: CSSProperties = {
    position: "absolute",
    left: `${(rect.x / stageWidth) * 100}%`,
    top: `${(rect.y / stageHeight) * 100}%`,
    width: `${(rect.width / stageWidth) * 100}%`,
    height: `${(rect.height / stageHeight) * 100}%`,
    transform: rect.rotation !== 0 ? `rotate(${rect.rotation}deg)` : undefined,
    transformOrigin: "center",
    boxShadow: selected ? SELECTION_HALO : undefined,
    cursor: "move",
  };
  return (
    <div
      ref={boxRef}
      role="button"
      tabIndex={0}
      onPointerDown={(e) => drag.begin(e, "move")}
      onPointerMove={drag.move}
      onPointerUp={drag.end}
      onPointerCancel={drag.end}
      className={cn("pointer-events-auto select-none", className)}
      style={style}
      aria-label={t("studio.transform.handles")}
    >
      {selected && <TransformChrome drag={drag} />}
    </div>
  );
}

export type { TransformDrag };
