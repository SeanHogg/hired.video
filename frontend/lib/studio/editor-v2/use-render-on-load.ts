/**
 * useRenderOnLoad — the `?render=1` entry (use-studio-entry-params): once the
 * saved project and its scenes have loaded, render + host the video ONCE via
 * the editor's own `ensureRendered` (which skips the render when the hosted
 * MP4 is already fresh). The Chrome extension opens Studio this way for
 * "Render & post": its panel watches the project's status and posts / fills
 * the message when the render lands, so nobody has to find the render button.
 */
import { useEffect, useRef } from "react";

export function useRenderOnLoad(args: {
  enabled: boolean;
  /** The saved project and its scenes are loaded (nothing to render before). */
  ready: boolean;
  ensureRendered: () => Promise<unknown>;
}): void {
  const { enabled, ready, ensureRendered } = args;
  const fired = useRef(false);
  const renderRef = useRef(ensureRendered);
  renderRef.current = ensureRendered;

  useEffect(() => {
    if (!enabled || !ready || fired.current) return;
    fired.current = true;
    // ensureRendered toasts its own failures; nothing else to do here.
    void renderRef.current();
  }, [enabled, ready]);
}
