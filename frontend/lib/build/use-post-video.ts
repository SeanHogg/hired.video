/**
 * usePostVideo — the kit post drawer's state: open/closed, and a key that
 * remounts the dock for a new draft (a new parse, an adopted résumé, Start
 * over) so it can never post onto the previous video.
 */
import { useCallback, useEffect, useState } from "react";

export function usePostVideo(draftKey: unknown) {
  const [open, setOpen] = useState(false);
  const [dockKey, setDockKey] = useState(0);

  useEffect(() => {
    setOpen(false);
    setDockKey((k) => k + 1);
  }, [draftKey]);

  return {
    open,
    show: useCallback(() => setOpen(true), []),
    close: useCallback(() => setOpen(false), []),
    dockKey,
  };
}
