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
import { useEffect } from "react";

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
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const typing = isTypingTarget(e.target);

      // Undo / redo always run on the canvas — even if focus is in a
      // text input, the OS-native undo for that field handles itself,
      // and we don't want to compete. So we early-return when typing.
      const key = e.key.toLowerCase();

      if (key === "z" && !e.shiftKey) {
        if (typing) return;
        e.preventDefault();
        handlers.onUndo();
        return;
      }
      if ((key === "z" && e.shiftKey) || key === "y") {
        if (typing) return;
        e.preventDefault();
        handlers.onRedo();
        return;
      }
      // Copy / cut / paste also defer to the browser when the user is
      // editing text — let them yank a string out of the title field
      // without us hijacking the clipboard for a canvas widget.
      if (key === "c") {
        if (typing) return;
        e.preventDefault();
        handlers.onCopy();
        return;
      }
      if (key === "x") {
        if (typing) return;
        e.preventDefault();
        handlers.onCut();
        return;
      }
      if (key === "v") {
        if (typing) return;
        e.preventDefault();
        handlers.onPaste();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}
