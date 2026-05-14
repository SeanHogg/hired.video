/**
 * useCanvasClipboard — in-editor cut/copy/paste for widgets and scenes.
 *
 * Holds the most-recently-yanked widget OR scene in a ref so paste can
 * fire after re-renders. Each paste regenerates ids (via the
 * cloneWithNewId helpers in canvas-state.ts) so the same source can be
 * pasted multiple times without colliding.
 *
 * Targets: widget paste lands in the active scene; scene paste inserts
 * after the active scene. Cut = copy + delete. The hook owns no state
 * tree of its own — it composes the host editor's setters.
 *
 * Browser clipboard: deliberately not used today. Same-tab paste is the
 * 95% case; OS-clipboard sync (cross-tab / cross-app) is gap-registered.
 */
import { useCallback, useReducer, useRef } from "react";
import {
  cloneSceneWithNewIds,
  cloneWidgetWithNewId,
  type CanvasState,
  type Scene,
  type Widget,
} from "./canvas-state";
import type { Selection } from "@/components/studio/v2/CanvasStage";

type ClipboardItem =
  | { kind: "widget"; widget: Widget }
  | { kind: "scene"; scene: Scene };

export interface CanvasClipboard {
  hasClipboard: boolean;
  clipboardKind: "widget" | "scene" | null;
  copy: () => boolean;
  cut: () => boolean;
  paste: () => boolean;
}

interface Args {
  state: CanvasState;
  selection: Selection;
  activeSceneId: string;
  setState: (updater: (prev: CanvasState) => CanvasState) => void;
  setActiveSceneId: (id: string) => void;
  setSelection: (sel: Selection) => void;
}

export function useCanvasClipboard({
  state,
  selection,
  activeSceneId,
  setState,
  setActiveSceneId,
  setSelection,
}: Args): CanvasClipboard {
  const clipboardRef = useRef<ClipboardItem | null>(null);
  // hasClipboard / clipboardKind are derived from the ref; bump to
  // re-render the toolbar whenever the clipboard changes.
  const [, bump] = useReducer((n: number) => n + 1, 0);

  /** What the user has selected, normalised to a copy-target. Returns
   *  null when nothing copyable is selected (or the selection has gone
   *  stale and no longer matches a real widget/scene). */
  const resolveTarget = useCallback((): ClipboardItem | null => {
    if (selection.kind === "widget") {
      const scene = state.scenes.find((s) => s.id === selection.sceneId);
      const widget = scene?.widgets.find((w) => w.id === selection.widgetId);
      return widget ? { kind: "widget", widget } : null;
    }
    const scene = state.scenes.find((s) => s.id === selection.sceneId);
    return scene ? { kind: "scene", scene } : null;
  }, [selection, state.scenes]);

  const copy = useCallback((): boolean => {
    const target = resolveTarget();
    if (!target) return false;
    // structuredClone via the helper gives us an isolated snapshot —
    // mutating the source after copy can't affect what gets pasted.
    clipboardRef.current =
      target.kind === "widget"
        ? { kind: "widget", widget: cloneWidgetWithNewId(target.widget) }
        : { kind: "scene", scene: cloneSceneWithNewIds(target.scene) };
    bump();
    return true;
  }, [resolveTarget]);

  const cut = useCallback((): boolean => {
    const target = resolveTarget();
    if (!target) return false;
    clipboardRef.current =
      target.kind === "widget"
        ? { kind: "widget", widget: cloneWidgetWithNewId(target.widget) }
        : { kind: "scene", scene: cloneSceneWithNewIds(target.scene) };
    if (target.kind === "widget") {
      const widgetId = target.widget.id;
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((s) => ({
          ...s,
          widgets: s.widgets.filter((w) => w.id !== widgetId),
        })),
      }));
      setSelection({ kind: "scene", sceneId: activeSceneId });
    } else {
      // Refuse to cut the last scene — the editor invariant is that
      // there's always at least one scene to draw on.
      if (state.scenes.length <= 1) {
        bump();
        return true;
      }
      const sceneId = target.scene.id;
      const remaining = state.scenes.filter((s) => s.id !== sceneId);
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.filter((s) => s.id !== sceneId),
      }));
      const fallback = remaining[0]?.id ?? sceneId;
      setActiveSceneId(fallback);
      setSelection({ kind: "scene", sceneId: fallback });
    }
    bump();
    return true;
  }, [
    resolveTarget,
    state.scenes,
    setState,
    setActiveSceneId,
    setSelection,
    activeSceneId,
  ]);

  const paste = useCallback((): boolean => {
    const item = clipboardRef.current;
    if (!item) return false;
    if (item.kind === "widget") {
      // Each paste mints a fresh id so repeated pastes don't collide.
      // Re-clone from the snapshot so the in-clipboard widget can be
      // pasted again (the previous paste's id would otherwise stay).
      const widget = cloneWidgetWithNewId(item.widget);
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((s) =>
          s.id === activeSceneId
            ? {
                ...s,
                widgets: [
                  ...s.widgets,
                  {
                    ...widget,
                    position: { ...widget.position, z: s.widgets.length + 1 },
                  },
                ],
              }
            : s,
        ),
      }));
      setSelection({ kind: "widget", sceneId: activeSceneId, widgetId: widget.id });
      return true;
    }
    const scene = cloneSceneWithNewIds(item.scene);
    scene.label = uniqueSceneLabel(scene.label, state.scenes);
    setState((prev) => {
      const idx = prev.scenes.findIndex((s) => s.id === activeSceneId);
      const insertAt = idx >= 0 ? idx + 1 : prev.scenes.length;
      const next = [...prev.scenes];
      next.splice(insertAt, 0, scene);
      return { ...prev, scenes: next };
    });
    setActiveSceneId(scene.id);
    setSelection({ kind: "scene", sceneId: scene.id });
    return true;
  }, [
    activeSceneId,
    state.scenes,
    setState,
    setActiveSceneId,
    setSelection,
  ]);

  return {
    hasClipboard: clipboardRef.current !== null,
    clipboardKind: clipboardRef.current?.kind ?? null,
    copy,
    cut,
    paste,
  };
}

/** "Scene 3" → "Scene 3 (copy)" → "Scene 3 (copy 2)" if the previous
 *  copy already exists. Keeps the scenes rail readable when the user
 *  pastes the same scene multiple times. */
function uniqueSceneLabel(base: string, existing: Scene[]): string {
  const labels = new Set(existing.map((s) => s.label));
  if (!labels.has(base)) return base;
  const stripped = base.replace(/\s*\(copy(?:\s+\d+)?\)$/, "");
  for (let i = 1; i < 1000; i += 1) {
    const candidate = i === 1 ? `${stripped} (copy)` : `${stripped} (copy ${i})`;
    if (!labels.has(candidate)) return candidate;
  }
  return base;
}
