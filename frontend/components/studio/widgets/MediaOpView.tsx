/**
 * DOM render of a `media` draw op (#2312): an <img>, or a <video> synced to
 * the editor playhead (#559), placed on the op's box with CSS object-fit —
 * the same placement `fitRect` gives the export. A chroma-keyed video keys
 * on a canvas with the math the export's `chroma-key` effect runs.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import type { ChromaKeyParams } from "@/lib/studio/editor-v2/canvas-state";
import { applyChromaKeyToPixels } from "@/lib/studio/chroma-key";
import { useVideoWidgetSync } from "@/lib/studio/editor-v2/use-video-widget-sync";
import type { DrawOp } from "@/lib/studio/widgets/draw-ops";
import type { Box } from "@/lib/studio/widgets/frame";

type MediaOp = Extract<DrawOp, { op: "media" }>;
/** `data-op` / `data-media` / `data-url`, carried onto the visible element. */
type DataAttrs = Record<`data-${string}`, string | number>;

export interface PlayheadProps {
  /** Clip-local time — video elements follow the editor's central clock. */
  clipTimeSec: number;
  isPlayback: boolean;
}

export function opBoxStyle(box: Box, origin: Box): CSSProperties {
  return { position: "absolute", left: box.x - origin.x, top: box.y - origin.y, width: box.w, height: box.h };
}

export default function MediaOpView({ op, origin, index, playhead }: { op: MediaOp; origin: Box; index: number; playhead: PlayheadProps }) {
  const style: CSSProperties = {
    ...opBoxStyle(op.box, origin),
    objectFit: op.fit === "stretch" ? "fill" : op.fit,
    filter: op.filter || undefined,
    transform: op.mirror ? "scaleX(-1)" : undefined,
    opacity: op.alpha,
  };
  const data: DataAttrs = { "data-op": index, "data-media": op.media, "data-url": op.url };
  if (op.media === "image") return <img {...data} src={op.url} alt={op.alt ?? ""} draggable={false} style={style} />;
  if (op.chromaKey) return <ChromaVideo data={data} op={op} chromaKey={op.chromaKey} style={style} playhead={playhead} />;
  return <SyncedVideo data={data} op={op} style={style} playhead={playhead} />;
}

function SyncedVideo({ op, style, playhead, data }: { op: MediaOp; style: CSSProperties; playhead: PlayheadProps; data: DataAttrs }) {
  const ref = useVideoWidgetSync(playhead);
  return <video {...data} ref={ref} src={op.url} muted={op.muted} playsInline controls={false} style={style} />;
}

/** Hidden <video> + visible <canvas>: each animation frame snapshots the
 *  video, keys it with `applyChromaKeyToPixels`, and blits the result. */
function ChromaVideo({
  op,
  chromaKey,
  style,
  playhead,
  data,
}: {
  op: MediaOp;
  chromaKey: ChromaKeyParams;
  style: CSSProperties;
  playhead: PlayheadProps;
  data: DataAttrs;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useVideoWidgetSync(playhead, videoRef);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The loop reads the latest key through a ref so slider nudges don't
  // restart it.
  const keyRef = useRef(chromaKey);
  useEffect(() => {
    keyRef.current = chromaKey;
  }, [chromaKey]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    let raf = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w > 0 && h > 0) {
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          try {
            ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            applyChromaKeyToPixels(img.data, keyRef.current);
            ctx.putImageData(img, 0, 0);
          } catch {
            // A cross-origin video taints the canvas — keep the last frame.
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [op.url]);

  return (
    <>
      <video
        ref={videoRef}
        src={op.url}
        muted={op.muted}
        crossOrigin="anonymous"
        loop
        playsInline
        controls={false}
        style={{ ...style, visibility: "hidden" }}
      />
      <canvas {...data} ref={canvasRef} style={style} />
    </>
  );
}
