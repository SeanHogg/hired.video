/**
 * RenderableElementView — DOM-mode renderer for a single
 * `RenderableElement`. Dispatches per kind to the right shared
 * component (ChartRenderer for charts, VideoPlayer for video,
 * native <img>/<audio>/<video> for the simple kinds).
 *
 * Pair to the canvas-mode `drawNode` in `lib/renderer/canvas-nodes.ts`
 * — that one rasterises elements into the export pipeline; this one
 * mounts them as live, interactive DOM. Both are driven from the same
 * `RenderableElement` shape so a chart on a resume page = a chart in
 * a video frame = the same data in two presentations.
 *
 * Self-contained per the DRY rule:
 *   • Returns null on unknown kinds (no caller branch needed).
 *   • Owns its own permission gate for the webcam kind (asks only
 *     when `interactive` and a recording isn't already saved).
 *   • Resolves its own positioning from `element.box` (% of parent),
 *     so hosts only need to wrap us in a positioned container.
 */

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import ChartRenderer from "@/components/studio/charts/ChartRenderer";
import StudioVideoSurface from "@/components/studio/StudioVideoSurface";
import type { RenderableElement } from "@/types/renderable-element";

interface RenderableElementViewProps {
  element: RenderableElement;
  /** Optional override — when omitted the box is read from `element.box`
   *  (% of parent). Pass `null` to skip absolute positioning entirely
   *  (for hosts that flow elements inline). */
  position?: "absolute" | "static" | null;
  className?: string;
}

export default function RenderableElementView({
  element,
  position = "absolute",
  className,
}: RenderableElementViewProps) {
  const positioned = position === "absolute";
  const wrapperStyle = positioned
    ? {
        position: "absolute" as const,
        left: `${element.box.x}%`,
        top: `${element.box.y}%`,
        width: `${element.box.w}%`,
        height: `${element.box.h}%`,
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        zIndex: element.z ?? 0,
        backgroundColor: element.style?.backgroundColor,
        borderColor: element.style?.borderColor,
        borderWidth: element.style?.borderWidth,
        borderStyle: element.style?.borderColor ? "solid" : undefined,
        borderRadius: element.style?.borderRadius,
        padding: element.style?.padding,
      }
    : undefined;

  const wrapperClass = cn("overflow-hidden", className);
  const inner = renderInner(element);
  if (!inner) return null;

  return (
    <div className={wrapperClass} style={wrapperStyle}>
      {inner}
    </div>
  );
}

function renderInner(el: RenderableElement): React.ReactNode {
  switch (el.kind) {
    case "text":
      return (
        <div
          className="w-full h-full flex"
          style={{
            justifyContent:
              el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start",
            alignItems:
              el.verticalAlign === "top"
                ? "flex-start"
                : el.verticalAlign === "bottom"
                  ? "flex-end"
                  : "center",
            color: el.color,
            fontFamily: el.fontFamily,
            fontWeight: el.fontWeight,
          }}
        >
          <div
            style={{
              fontSize: el.fontSize ? `${el.fontSize}px` : undefined,
              textAlign: el.align,
              whiteSpace: "pre-wrap",
            }}
          >
            {el.text}
          </div>
        </div>
      );

    case "image":
      return el.url ? (
        <img
          src={el.url}
          alt=""
          className="w-full h-full"
          style={{ objectFit: el.fit ?? "cover" }}
        />
      ) : null;

    case "video":
      return el.url ? (
        <StudioVideoSurface
          mode="flat"
          source={{ kind: "url", url: el.url }}
          aspectRatio={`${el.box.w}:${el.box.h}`}
          autoPlay={false}
          loop={el.loop ?? true}
          muted={el.muted ?? true}
          controls
          className="rounded-none shadow-none bg-transparent"
        />
      ) : null;

    case "audio":
      return el.url ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2">
          {el.label && <p className="text-xs font-medium truncate">{el.label}</p>}
          <audio src={el.url} controls className="w-full" />
        </div>
      ) : null;

    case "chips":
      return (
        <div
          className="w-full h-full flex"
          style={{
            flexDirection: el.direction === "column" ? "column" : "row",
            flexWrap: el.direction === "column" ? "nowrap" : "wrap",
            gap: "0.5em",
            alignContent: "center",
            alignItems: "center",
            justifyContent: el.direction === "column" ? "center" : "flex-start",
            fontSize: el.fontSize ? `${el.fontSize * 0.5}px` : undefined,
            fontFamily: el.fontFamily,
          }}
        >
          {el.chips.filter(Boolean).map((c, i) => (
            <span
              key={i}
              className="rounded-full px-2 py-0.5 font-semibold"
              style={{
                backgroundColor: el.chipColor ?? "rgba(16,185,129,0.20)",
                color: el.textColor ?? "#6ee7b7",
              }}
            >
              {c}
            </span>
          ))}
        </div>
      );

    case "chart":
      return (
        <ChartRenderer
          chartType={el.chartType}
          data={el.data}
          format={el.format}
          colors={el.colors}
          title={el.title}
          takeaway={el.takeaway}
        />
      );

    case "webcam":
      return <WebcamElementView element={el} />;
  }
}

/** Webcam sub-renderer — owns its own permission lifecycle so callers
 *  don't have to thread getUserMedia state. When a recording exists we
 *  play it back; otherwise we offer a one-click "Enable camera" affordance
 *  that requests permission and shows the live preview. */
function WebcamElementView({
  element,
}: {
  element: import("@/types/renderable-element").WebcamElement;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [stream]);

  // Recorded playback — no permission needed.
  if (element.recordingUrl) {
    return (
      <video
        src={element.recordingUrl}
        controls
        muted={element.muted}
        playsInline
        className="w-full h-full object-cover"
        style={{ transform: element.mirror !== false ? "scaleX(-1)" : undefined }}
      />
    );
  }

  // Live preview path. We ask once on the user's click — never on mount —
  // so a public resume page doesn't surprise visitors with a permission
  // prompt before they've decided to engage.
  if (!requested || !stream) {
    return (
      <button
        type="button"
        onClick={async () => {
          setRequested(true);
          setError(null);
          try {
            const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            setStream(s);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Camera access denied");
          }
        }}
        className="w-full h-full flex flex-col items-center justify-center gap-2 bg-black/40 text-white hover:bg-black/55 transition-colors"
      >
        <Camera className="w-6 h-6" />
        <span className="text-xs">{error ? error : "Enable camera"}</span>
      </button>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="w-full h-full object-cover"
      style={{ transform: element.mirror !== false ? "scaleX(-1)" : undefined }}
    />
  );
}
