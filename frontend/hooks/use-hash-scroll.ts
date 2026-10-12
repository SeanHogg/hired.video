import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/** ~2s at 60fps: long enough for a lazily rendered section to mount. */
const MAX_FRAMES = 120;

/** Scroll the element named by `hash` (`#id`) into view. Returns false when
 *  there is no such element (yet). */
export function scrollToHash(hash: string, behavior: ScrollBehavior): boolean {
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  if (!id) return false;
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior, block: "start" });
  return true;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * React Router doesn't scroll to `#id` targets. This does, on every location
 * change that carries a hash (including re-clicking the same link, which mints
 * a new location key): smooth when the visitor stays on the same page, an
 * instant jump when they arrived from another page (or prefer reduced
 * motion). Retries for a couple of seconds so a section that renders after the
 * route change still gets reached.
 */
export function useHashScroll(): void {
  const { pathname, hash, key } = useLocation();
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    const samePage = previousPath.current === pathname;
    previousPath.current = pathname;
    if (!hash) return;

    const behavior: ScrollBehavior = samePage && !prefersReducedMotion() ? "smooth" : "auto";
    let frame = 0;
    let tries = 0;
    const attempt = () => {
      if (scrollToHash(hash, behavior) || ++tries > MAX_FRAMES) return;
      frame = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash, key]);
}
