/**
 * A workspace page (WorkspaceFrame, or AppShell variant "workspace") owns the viewport
 * from `lg`: its columns scroll, the document never does. Anything outside
 * the shell's box (an off-screen render or measuring layer, a portal) would
 * otherwise still make the page taller than the screen — a third scrollbar
 * that scrolls the whole workspace away and leaves the screen blank.
 *
 * While `active`, `<html>` carries `workspace-viewport-lock`; global.css
 * pins html + body to the viewport with overflow hidden at `lg` and up
 * (below it the columns stack and the page scrolls as usual).
 */
import { useEffect } from "react";

const LOCK_CLASS = "workspace-viewport-lock";

export function useWorkspaceViewportLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.classList.add(LOCK_CLASS);
    // Whatever scrolled the document before the lock (a scrollIntoView)
    // must not leave the workspace shifted up.
    window.scrollTo(0, 0);
    return () => root.classList.remove(LOCK_CLASS);
  }, [active]);
}
