/**
 * use-rotation — an index that steps every `intervalMs` (the home page's
 * rotating headline word and line). It always steps: reduced motion is the
 * caller's job (drop the fade with `motion-reduce:animate-none`), because
 * Windows reports `prefers-reduced-motion: reduce` whenever "Animation
 * effects" is off, and halting there left the desktop headline frozen.
 */
import { useEffect, useState } from "react";

export function useRotation(length: number, intervalMs: number): number {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (length < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % length), intervalMs);
    return () => window.clearInterval(id);
  }, [length, intervalMs]);
  return length > 0 ? index % length : 0;
}
