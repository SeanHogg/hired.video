/**
 * useMediaQuery — live `window.matchMedia(query).matches`, false on the
 * server / before the first paint. The ONE subscription every breakpoint
 * hook (useIsMobile, the workspace's desktop/phone split) goes through.
 */
import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  const read = () => (typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches);
  return useSyncExternalStore(subscribe, read, () => false);
}

/** The workspace's side-by-side layout (Tailwind `lg`): rail + canvas +
 *  slide-out. Below it the rail is a bottom bar and panels are sheets. */
export const WORKSPACE_WIDE_QUERY = "(min-width: 1024px)";

export function useIsWideWorkspace(): boolean {
  return useMediaQuery(WORKSPACE_WIDE_QUERY);
}
