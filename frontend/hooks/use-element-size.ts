import { useLayoutEffect, useState, type RefObject } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Layout size of an element (CSS px, before any ancestor transform — so a
 * zoomed stage still reports its native size), kept current with a
 * ResizeObserver. Null until first measured.
 */
export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize | null {
  const [size, setSize] = useState<ElementSize | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      setSize((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
