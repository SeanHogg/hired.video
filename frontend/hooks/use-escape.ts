/**
 * useEscape — Escape calls `onEscape` while `active` (a sheet, a slide-out,
 * an overlay). Escape that belongs to something on top is left alone: a key
 * already handled (defaultPrevented), or one meant for an open dialog, menu
 * or popover (Radix closes those itself on the same keydown — they are
 * still in the DOM when this listener runs). A tooltip's wrapper alone (one
 * still fading out) doesn't count; an open tooltip takes the first Escape
 * itself (defaultPrevented).
 */
import { useEffect } from "react";

const OPEN_LAYER = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[data-radix-popper-content-wrapper]:not(:has([role="tooltip"]))',
].join(", ");

export function useEscape(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(OPEN_LAYER)) return;
      onEscape();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, onEscape]);
}
