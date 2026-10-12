/**
 * useStagedProgress — paces a fixed list of steps for work that reports
 * little or no progress of its own.
 *
 * Returns the index of the step in flight: it advances every `stepMs` and
 * then HOLDS on the last step until the caller unmounts (the work landed),
 * so the UI never claims "done" before the result does.
 *
 * Real progress narrows the pacing through an optional window: `floor`
 * jumps straight to a step the work has provably reached, `ceiling` holds
 * pacing short of steps it hasn't.
 */
import { useEffect, useState } from "react";

export function useStagedProgress(
  stepCount: number,
  stepMs: number,
  { floor = 0, ceiling = stepCount - 1 }: { floor?: number; ceiling?: number } = {},
): number {
  const [paced, setPaced] = useState(0);
  const active = Math.min(Math.max(paced, floor), Math.max(ceiling, floor));

  useEffect(() => {
    if (active >= ceiling) return;
    const timer = window.setTimeout(() => setPaced(active + 1), stepMs);
    return () => window.clearTimeout(timer);
  }, [active, ceiling, stepMs]);

  return active;
}
