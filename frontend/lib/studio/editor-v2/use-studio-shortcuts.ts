/**
 * Global keyboard map for the v2 studio editor.
 *
 * Covers undo/redo + cut/copy/paste so the editor matches Canva /
 * CapCut / Figma muscle memory. The hook only dispatches — it owns no
 * state. Callers wire each callback to their own history / clipboard
 * hooks so the keyboard surface and the toolbar buttons run through
 * the SAME action functions (DRY).
 *
 * Focus rules: shortcuts are suppressed when the user is typing into
 * an `<input>`, `<textarea>`, `<select>`, or contentEditable region.
 * Without this, Ctrl+Z in the title field would undo the canvas
 * instead of the text input — a guaranteed lost-work footgun.
 *
 * Modifier: we accept either Cmd (mac) or Ctrl (win/linux) so the
 * same listener works on every platform without sniffing
 * `navigator.platform` (which is deprecated and unreliable).
 */
import { useEffect, useRef } from "react";

export interface StudioShortcutHandlers {
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
}

/** Whether keystrokes targeted at this element should be ignored
 *  (i.e. the user is typing into a real text input, not the canvas).
 *  Exported for tests. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useStudioShortcuts(handlers: StudioShortcutHandlers): void {
  // Keep handlers in a ref so the keydown listener always sees the
  // latest functions without us having to tear down + re-attach the
  // listener on every render (handlers is a fresh object each call).
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      // Copy / cut / paste / undo defer to the browser whenever the
      // user is typing into a text field — otherwise Ctrl+Z in the
      // title input would undo the canvas instead of the title text,
      // which is a guaranteed lost-work footgun.
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();
      const h = handlersRef.current;

      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        h.onUndo();
        return;
      }
      if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        h.onRedo();
        return;
      }
      if (key === "c") {
        e.preventDefault();
        h.onCopy();
        return;
      }
      if (key === "x") {
        e.preventDefault();
        h.onCut();
        return;
      }
      if (key === "v") {
        e.preventDefault();
        h.onPaste();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
