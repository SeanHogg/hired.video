/**
 * ⌘/Ctrl+Z, ⇧⌘/Ctrl+Shift+Z and Ctrl+Y for the workspace's ONE history,
 * while focus is not in a text field (where the browser's own field-level
 * undo applies instead). Formats with their own shortcut map (the studio's
 * useStudioShortcuts) pass `enabled: false`.
 */
import { useEffect } from "react";

export interface HistoryControls {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function useUndoShortcuts(history: HistoryControls | null, enabled = true): void {
  const undo = history?.undo;
  const redo = history?.redo;
  useEffect(() => {
    if (!enabled || !undo || !redo) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || isTextTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, undo, redo]);
}
