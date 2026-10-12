/**
 * DOM interpreter for a widget drawing (#2312) — the interactive half of
 * every plugin; the export half is lib/studio/widgets/paint-ops.ts. Both
 * read the same ops in canvas px, so geometry, colours and text breaks match.
 *
 * Consecutive vector ops (rect / ellipse / path / text) render in one <svg>
 * whose viewBox is the content box; media, raster and embed ops are
 * absolutely placed elements, kept in op order so layering matches the
 * export's paint order. Elements carry `data-op` (the op's index).
 */
import { useEffect, useRef, type ReactNode } from "react";
import { pathToSvg, type DrawOp, type Stroke } from "@/lib/studio/widgets/draw-ops";
import type { Box } from "@/lib/studio/widgets/frame";
import { TEXT_RESET_STYLE, textBaselineOffset } from "@/lib/studio/widgets/text-layout";
import MediaOpView, { opBoxStyle, type PlayheadProps } from "./MediaOpView";

type VectorOp = Extract<DrawOp, { op: "rect" | "ellipse" | "path" | "text" }>;
type RasterOp = Extract<DrawOp, { op: "raster" }>;
type EmbedOp = Extract<DrawOp, { op: "embed" }>;

export interface WidgetDrawingViewProps {
  ops: ReadonlyArray<DrawOp>;
  /** The content box the ops are laid out in (canvas px). */
  content: Box;
  playhead: PlayheadProps;
  /** The live component for an embed op; null renders its fallback ops. */
  renderEmbed: (op: EmbedOp) => ReactNode | null;
}

function strokeProps(stroke: Stroke | undefined) {
  if (!stroke || stroke.width <= 0) return {};
  return {
    stroke: stroke.color,
    strokeWidth: stroke.width,
    strokeLinejoin: "round" as const,
    ...(stroke.dash ? { strokeDasharray: stroke.dash.join(" ") } : {}),
  };
}

function VectorElement({ op, index }: { op: VectorOp; index: number }) {
  const common = { "data-op": index, opacity: op.alpha };
  switch (op.op) {
    case "rect":
      return (
        <rect
          {...common}
          x={op.box.x}
          y={op.box.y}
          width={op.box.w}
          height={op.box.h}
          rx={op.radius || undefined}
          ry={op.radius || undefined}
          fill={op.fill ?? "none"}
          {...strokeProps(op.stroke)}
        />
      );
    case "ellipse":
      return (
        <ellipse
          {...common}
          cx={op.box.x + op.box.w / 2}
          cy={op.box.y + op.box.h / 2}
          rx={op.box.w / 2}
          ry={op.box.h / 2}
          fill={op.fill ?? "none"}
          {...strokeProps(op.stroke)}
        />
      );
    case "path":
      return <path {...common} d={pathToSvg(op.d)} fill={op.fill ?? "none"} {...strokeProps(op.stroke)} />;
    case "text":
      return (
        <text
          {...common}
          x={op.x}
          // Same alphabetic baseline the export paints on (textBaselineOffset).
          y={op.y + textBaselineOffset(op.font)}
          textAnchor={op.align === "center" ? "middle" : op.align === "right" ? "end" : "start"}
          dominantBaseline="alphabetic"
          fill={op.color}
          fontFamily={op.font.fontFamily}
          fontSize={op.font.fontPx}
          fontWeight={op.font.fontWeight}
          fontStyle={op.font.italic ? "italic" : undefined}
          style={{ whiteSpace: "pre", ...TEXT_RESET_STYLE }}
        >
          {op.text}
        </text>
      );
  }
}

/** A raster op on a <canvas>: the op's own painter, mapped onto its box. */
function RasterOpView({ op, origin, index }: { op: RasterOp; origin: Box; index: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const { x, y, w, h } = op.box;
  const paint = op.paint;
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, -x * dpr, -y * dpr);
    ctx.clearRect(x, y, w, h);
    paint(ctx, { x, y, w, h });
    // `key` stands for everything `paint` closes over.
  }, [op.key, x, y, w, h, dpr]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <canvas
      ref={ref}
      data-op={index}
      width={Math.max(1, Math.round(w * dpr))}
      height={Math.max(1, Math.round(h * dpr))}
      style={{ ...opBoxStyle(op.box, origin), opacity: op.alpha }}
    />
  );
}

export default function WidgetDrawingView({ ops, content, playhead, renderEmbed }: WidgetDrawingViewProps) {
  const out: ReactNode[] = [];
  let run: Array<{ op: VectorOp; index: number }> = [];
  const flush = () => {
    if (run.length === 0) return;
    out.push(
      <svg
        key={`svg-${run[0].index}`}
        viewBox={`${content.x} ${content.y} ${Math.max(1, content.w)} ${Math.max(1, content.h)}`}
        width={content.w}
        height={content.h}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
        aria-hidden
      >
        {run.map(({ op, index }) => (
          <VectorElement key={index} op={op} index={index} />
        ))}
      </svg>,
    );
    run = [];
  };

  ops.forEach((op, index) => {
    if (op.editorOnly && playhead.isPlayback) return;
    if (op.op === "rect" || op.op === "ellipse" || op.op === "path" || op.op === "text") {
      run.push({ op, index });
      return;
    }
    flush();
    if (op.op === "media") {
      out.push(<MediaOpView key={index} op={op} origin={content} index={index} playhead={playhead} />);
    } else if (op.op === "raster") {
      out.push(<RasterOpView key={index} op={op} origin={content} index={index} />);
    } else {
      const live = renderEmbed(op);
      out.push(
        <div key={index} data-op={index} data-embed={op.embed} style={opBoxStyle(op.box, content)}>
          {live ?? (
            <WidgetDrawingView ops={op.fallback} content={op.box} playhead={playhead} renderEmbed={() => null} />
          )}
        </div>,
      );
    }
  });
  flush();
  return <div className="relative h-full w-full">{out}</div>;
}
