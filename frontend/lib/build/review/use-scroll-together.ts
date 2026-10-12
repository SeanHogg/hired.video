/**
 * useScrollTogether — keep two scroll boxes at the same relative position
 * while `on` (the compare panel's "Scroll together"). The box being
 * scrolled leads; the echo scroll it causes on the other box is ignored.
 */
import { useCallback, useRef, type RefObject } from "react";

export function useScrollTogether(a: RefObject<HTMLElement>, b: RefObject<HTMLElement>, on: boolean) {
  const leading = useRef<"a" | "b" | null>(null);
  const release = useRef<number | null>(null);

  const follow = useCallback(
    (from: RefObject<HTMLElement>, to: RefObject<HTMLElement>, who: "a" | "b") => {
      if (!on || (leading.current && leading.current !== who)) return;
      const src = from.current;
      const dst = to.current;
      if (!src || !dst) return;
      leading.current = who;
      const range = src.scrollHeight - src.clientHeight;
      const ratio = range > 0 ? src.scrollTop / range : 0;
      dst.scrollTop = ratio * (dst.scrollHeight - dst.clientHeight);
      if (release.current !== null) window.clearTimeout(release.current);
      release.current = window.setTimeout(() => {
        leading.current = null;
      }, 80);
    },
    [on],
  );

  return {
    fromLeft: useCallback(() => follow(a, b, "a"), [follow, a, b]),
    fromRight: useCallback(() => follow(b, a, "b"), [follow, a, b]),
  };
}
