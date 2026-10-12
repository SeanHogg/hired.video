/**
 * HeaderActions — lets a page put its primary actions into the app's top bar
 * instead of stacking a second header under it.
 *
 *   <HeaderActionsOutlet />   rendered once by Navigation, right of the search
 *   <HeaderActions>…</HeaderActions>   rendered by any page; portals there
 *
 * The provider is owned by AppShell (it renders both the bar and the page), so
 * pages need no wiring beyond the component. Without a mounted outlet (the
 * minimal shell while auth resolves, embeds) the actions render nothing rather
 * than inline, so a page never shows them twice.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface HeaderActionsSlot {
  target: HTMLElement | null;
  setTarget: (el: HTMLElement | null) => void;
}

const HeaderActionsContext = createContext<HeaderActionsSlot | null>(null);

export function HeaderActionsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return (
    <HeaderActionsContext.Provider value={{ target, setTarget }}>{children}</HeaderActionsContext.Provider>
  );
}

/** Where page actions land in the top bar. Collapses when no page uses it. */
export function HeaderActionsOutlet({ className }: { className?: string }): JSX.Element | null {
  const slot = useContext(HeaderActionsContext);
  if (!slot) return null;
  return <div ref={slot.setTarget} className={cn("flex items-center gap-2 empty:hidden", className)} />;
}

/** Render children into the top bar's action slot. */
export function HeaderActions({ children }: { children: ReactNode }): JSX.Element | null {
  const slot = useContext(HeaderActionsContext);
  if (!slot?.target) return null;
  return createPortal(children, slot.target);
}
