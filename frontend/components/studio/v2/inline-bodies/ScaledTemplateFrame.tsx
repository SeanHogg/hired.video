/**
 * ScaledTemplateFrame — shared scale-to-fit shell every linked-content
 * inline body wraps its renderer in. Measures the container + the inner
 * (fixed-width) child via ResizeObserver, then stamps a single
 * `transform: scale(...)` on the child so the rendered entity fills
 * 100% of the bounded widget. Crops the longer axis via the container's
 * `overflow: hidden` — no letterbox whitespace.
 *
 * Per the DRY rule: every per-kind inline body (resume / job /
 * article / profile / company / video / future kinds) mounts THIS
 * component. Adding a new kind never re-rolls "how do I fit my
 * renderer into a fractional canvas widget?" — pass the native
 * authoring width + the renderer's element children and the shell
 * handles the rest.
 */
import { useEffect, useRef, useState } from "react";

/** Default native authoring width — matches the `max-w-[800px]`
 *  containers most of the app's "detail page" renderers (resume / job)
 *  are designed against. Per-kind bodies can override via the `width`
 *  prop when their renderer is authored against a different native
 *  size (e.g. wide social-card aspect ratios). */
const DEFAULT_NATIVE_WIDTH = 800;

interface ScaledTemplateFrameProps {
  children: React.ReactNode;
  /** Native pixel width the inner renderer is authored against. The
   *  inner div is sized to this exact pixel width and the scale picks
   *  up the ratio against the container. Defaults to 800px. */
  width?: number;
  /** Optional background colour for the frame. Defaults to white so a
   *  resume / job thumbnail doesn't bleed against a dark canvas before
   *  its template paints its own bg. */
  background?: string;
}

export default function ScaledTemplateFrame({
  children,
  width = DEFAULT_NATIVE_WIDTH,
  background = "#ffffff",
}: ScaledTemplateFrameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;
    const update = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      // CSS transforms don't affect offsetHeight — so the inner div's
      // offsetHeight is the renderer's natural pixel height at the
      // authored native width, even after we've stamped the scale.
      const ih = inner.offsetHeight;
      if (cw <= 0 || ch <= 0 || ih <= 0) return;
      const widthScale = cw / width;
      const heightScale = ch / ih;
      // `max` so the bigger ratio wins → the renderer always fills
      // both dimensions and the remaining axis crops via the
      // container's `overflow: hidden`. No letterbox whitespace.
      setScale(Math.max(widthScale, heightScale));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
      style={{ background }}
    >
      <div
        ref={innerRef}
        style={{
          width,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
