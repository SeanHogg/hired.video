/**
 * useStripClipboard — copy / cut / paste / duplicate for the video strip:
 * the selected element (a clip on the frame) when one is selected, else the
 * selected scene. Header buttons and Ctrl/⌘ + C · X · V · D while the strip
 * has focus — and, while `active`, from the canvas region too (the frame on
 * screen), so the frame and the strip share ONE clipboard. Never over a field
 * or selected text, so the page's own copy still works. Every action is ONE
 * plan change, so it is one Undo step on the kit's history.
 *
 * Elements paste through the frame editor (new id, nudged, into the scene on
 * screen); scenes through the pure plan ops in strip-clipboard.ts. The
 * clipboard itself is per-viewer, in memory (same-tab), like the studio's
 * useCanvasClipboard — which works on a free-form CanvasState and can't be
 * reused over the plan's fixed scene slots.
 */
import { useCallback, useEffect, useReducer, useRef, type KeyboardEvent } from "react";
import { VIDEO_SCENE_IDS, type VideoPlan, type VideoSceneId } from "@shared/video-plan";
import { findWidget, type CanvasState, type Widget } from "@/lib/studio/editor-v2/canvas-state";
import type { Selection } from "@/lib/studio/editor-v2/editor-types";
import { isTextTarget } from "@/lib/workspace/use-undo-shortcuts";
import { copySceneClip, cutScene, pasteSceneClip, type SceneClip } from "./strip-clipboard";

type ClipboardItem = { kind: "widget"; widget: Widget } | { kind: "scene"; clip: SceneClip };

interface Args {
  plan: VideoPlan;
  canvas: CanvasState | null;
  /** The frame editor's selection (an element, or the selected scene). */
  selection: Selection;
  scene: VideoSceneId;
  updatePlan: (next: VideoPlan, group?: string) => void;
  onSelectScene: (id: VideoSceneId) => void;
  /** The frame editor's element paste + remove (each one plan change). */
  pasteWidget: (widget: Widget) => void;
  removeWidget: (widgetId: string) => void;
  /** Also answer the shortcuts from the canvas region (Advanced, video on screen). */
  active?: boolean;
}

type ClipboardKey = "c" | "x" | "v" | "d";
type KeyLike = Pick<globalThis.KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "key" | "target">;

/** The clipboard key a keystroke asks for, or null (no modifier, Alt/Shift, typing). */
export function clipboardKey(e: KeyLike): ClipboardKey | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || isTextTarget(e.target)) return null;
  const key = e.key.toLowerCase();
  return key === "c" || key === "x" || key === "v" || key === "d" ? key : null;
}

/** The key came from the canvas region (or nothing focused), with no text selected. */
export function meantForCanvas(target: EventTarget | null): boolean {
  if (window.getSelection()?.toString()) return false;
  if (!(target instanceof HTMLElement)) return true;
  return target === document.body || target.closest('[data-region="canvas"]') !== null;
}

export function useStripClipboard({ plan, canvas, selection, scene, updatePlan, onSelectScene, pasteWidget, removeWidget, active = false }: Args) {
  const clipboard = useRef<ClipboardItem | null>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const widget = selection.kind === "widget" && canvas ? findWidget(canvas, selection.widgetId)?.widget ?? null : null;

  const copy = useCallback((): boolean => {
    clipboard.current = widget
      ? { kind: "widget", widget: structuredClone(widget) }
      : { kind: "scene", clip: copySceneClip(plan, scene, canvas) };
    bump();
    return true;
  }, [widget, plan, scene, canvas]);

  const cut = useCallback((): boolean => {
    if (widget) {
      clipboard.current = { kind: "widget", widget: structuredClone(widget) };
      bump();
      removeWidget(widget.id);
      return true;
    }
    const next = cutScene(plan, scene);
    if (!next) return false;
    clipboard.current = { kind: "scene", clip: copySceneClip(plan, scene, canvas) };
    bump();
    updatePlan(next);
    // The cut scene left the video: select the next one still in it.
    const after = [...VIDEO_SCENE_IDS.slice(VIDEO_SCENE_IDS.indexOf(scene) + 1), ...VIDEO_SCENE_IDS].find(
      (id) => id !== scene && !next.scenes?.[id]?.off,
    );
    if (after) onSelectScene(after);
    return true;
  }, [widget, plan, scene, canvas, updatePlan, removeWidget, onSelectScene]);

  const paste = useCallback((): boolean => {
    const item = clipboard.current;
    if (!item) return false;
    if (item.kind === "widget") pasteWidget(item.widget);
    else updatePlan(pasteSceneClip(plan, scene, item.clip));
    return true;
  }, [plan, scene, updatePlan, pasteWidget]);

  /** Elements only: the five scenes are fixed slots, there is no sixth. */
  const duplicate = useCallback((): boolean => {
    if (!widget) return false;
    pasteWidget(widget);
    return true;
  }, [widget, pasteWidget]);

  const run = useCallback(
    (key: ClipboardKey): boolean => ({ c: copy, x: cut, v: paste, d: duplicate })[key](),
    [copy, cut, paste, duplicate],
  );

  /** The strip's own keys (it is focusable). */
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const key = clipboardKey(e);
      if (!key) return;
      e.preventDefault();
      run(key);
    },
    [run],
  );

  // The same keys from the canvas region: one clipboard for frame and strip.
  useEffect(() => {
    if (!active) return;
    const onDocKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || !meantForCanvas(e.target)) return;
      const key = clipboardKey(e);
      if (key && run(key)) e.preventDefault();
    };
    document.addEventListener("keydown", onDocKey);
    return () => document.removeEventListener("keydown", onDocKey);
  }, [active, run]);

  return {
    /** What a copy / cut would take. */
    target: widget ? ("element" as const) : ("scene" as const),
    canCut: widget !== null || cutScene(plan, scene) !== null,
    canPaste: clipboard.current !== null,
    canDuplicate: widget !== null,
    copy,
    cut,
    paste,
    duplicate,
    onKeyDown,
  };
}

export type StripClipboard = ReturnType<typeof useStripClipboard>;
