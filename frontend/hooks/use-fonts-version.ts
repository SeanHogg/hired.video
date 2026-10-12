import { useEffect, useState } from "react";

/**
 * A counter that bumps whenever the document finishes loading web fonts.
 * Anything that measures text with canvas metrics (which silently fall back
 * to a system font until the web font arrives) keys its layout on this.
 */
export function useFontsVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    const bump = () => setVersion((v) => v + 1);
    void document.fonts.ready.then(bump);
    document.fonts.addEventListener("loadingdone", bump);
    return () => document.fonts.removeEventListener("loadingdone", bump);
  }, []);
  return version;
}
