/**
 * useFrameEditor — the state + handlers of the kit's ONE video editor: the
 * studio's own CanvasStage on the Video view (select, drag, resize, retype on
 * the frame, Delete) and, under Advanced, the studio's WidgetPalette,
 * LayersPanel and PropertiesPanel.
 *
 * It owns only UI state (what is selected, which widget is being retyped);
 * every edit becomes a résumé or plan change through the page's ONE history
 * (`commit` / `updatePlan`), so Undo / Redo cover the frame like the page and
 * there is no second studio history or project. The mapping rules live in
 * frame-edits.ts (pure, tested).
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { ResumeContent } from "@shared/resume";
import type { VideoPlan, VideoSceneId } from "@shared/video-plan";
import {
  cloneWidgetWithNewId,
  defaultWidget,
  findWidget,
  makeLinkedContentWidget,
  type CanvasState,
  type Widget,
  type WidgetKind,
  type WidgetPosition,
} from "@/lib/studio/editor-v2/canvas-state";
import { resolveLinkedContentColors, type LinkedContentKind } from "@/lib/studio/editor-v2/linked-content";
import { layerZ } from "@/lib/studio/editor-v2/layer-order";
import type { AnonGateValue } from "@/lib/studio/anon-gate-context";
import type { Selection } from "@/lib/studio/editor-v2/editor-types";
import { useGatedScreenshot } from "./use-gated-screenshot";
import {
  addWidget,
  hasCanvasOverrides,
  overrideWidgetPosition,
  removeWidget,
  resetCanvasOverrides,
  videoSceneIdOfCanvasScene,
} from "./canvas-overrides";
import { mediaWidget, placeWidget, planWidgetPatch, retypeWidget, widgetText } from "./frame-edits";
import type { Translate } from "./video-copy";
import { canvasSceneId } from "./scene-voiceover";
import { resolutionScale } from "./resolution-scale";
import { isCaptionWidgetId } from "./captions";

interface Args {
  /** The canvas as it plays (overrides + narration applied). */
  canvas: CanvasState | null;
  content: ResumeContent | null;
  plan: VideoPlan;
  commit: (next: ResumeContent, group?: string) => void;
  updatePlan: (next: VideoPlan, group?: string) => void;
  /** The scene the page has selected (inspector, Story, chat focus). */
  scene: VideoSceneId;
  onSelectScene: (id: VideoSceneId) => void;
  /** Guest-first gate for uploads (a screenshot): a signed-out owner gets a
   *  silent guest session. The palette's MediaPicker reads the same value
   *  through AnonGateContext (AdvancedVideoEditor provides it). */
  uploadGate: AnonGateValue;
  t: Translate;
}

export function useFrameEditor({
  canvas,
  content,
  plan,
  commit,
  updatePlan,
  scene,
  onSelectScene,
  uploadGate,
  t,
}: Args) {
  const gatedScreenshot = useGatedScreenshot(uploadGate);
  const [picked, setPicked] = useState<{ sceneId: string; widgetId: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // A press that turned into a drag must not open the text editor on its click.
  const draggedRef = useRef(false);

  // A selection whose widget is gone (undo, removal, a re-parse) falls back
  // to the scene; the page's selected scene is the scene selection.
  const selected = useMemo(() => (canvas && picked ? findWidget(canvas, picked.widgetId) : null), [canvas, picked]);
  const selection = useMemo<Selection>(
    () =>
      selected
        ? { kind: "widget", sceneId: selected.scene.id, widgetId: selected.widget.id }
        : { kind: "scene", sceneId: canvasSceneId(scene) },
    [selected, scene],
  );
  const editing = selected && editingId === selected.widget.id && widgetText(selected.widget) !== null ? selected.widget : null;

  const focusScene = useCallback(
    (canvasSceneId: string) => {
      const id = videoSceneIdOfCanvasScene(canvasSceneId);
      if (id && id !== scene) onSelectScene(id);
    },
    [scene, onSelectScene],
  );

  const select = useCallback(
    (next: Selection) => {
      const dragged = draggedRef.current;
      draggedRef.current = false;
      // Captions are derived from the voiceover (reworded on the Captions
      // track), so a click on one on the frame selects its scene instead.
      if (next.kind === "scene" || isCaptionWidgetId(next.widgetId)) {
        setPicked(null);
        setEditingId(null);
        focusScene(next.sceneId);
        return;
      }
      // Clicking the selected text widget again (without dragging it) retypes it.
      if (picked?.widgetId === next.widgetId) {
        if (!dragged) setEditingId(next.widgetId);
        return;
      }
      setPicked({ sceneId: next.sceneId, widgetId: next.widgetId });
      setEditingId(null);
      focusScene(next.sceneId);
    },
    [picked, focusScene],
  );

  const move = useCallback(
    (widgetId: string, position: WidgetPosition) => {
      draggedRef.current = true;
      setEditingId(null);
      updatePlan(overrideWidgetPosition(plan, widgetId, position), `video:move:${widgetId}`);
    },
    [plan, updatePlan],
  );

  const retype = useCallback(
    (widgetId: string, text: string) => {
      if (!content) return;
      const group = `video:text:${widgetId}`;
      const result = retypeWidget(content, plan, widgetId, text, t);
      if (result.target === "content") commit(result.content, group);
      else updatePlan(result.plan, group);
    },
    [content, plan, commit, updatePlan, t],
  );

  /** Layers: restack a scene's elements (front-to-back ids) — ONE undo step. */
  const reorder = useCallback(
    (sceneId: string, widgetIdsFrontToBack: readonly string[]) => {
      const scene = canvas?.scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      const next = scene.widgets.reduce(
        (acc, w) => overrideWidgetPosition(acc, w.id, { ...w.position, z: layerZ(widgetIdsFrontToBack, w.id) }),
        plan,
      );
      if (next !== plan) updatePlan(next, `video:layers:${sceneId}`);
    },
    [canvas, plan, updatePlan],
  );

  const remove = useCallback(
    (widgetId: string) => {
      setPicked(null);
      setEditingId(null);
      updatePlan(removeWidget(plan, widgetId));
    },
    [plan, updatePlan],
  );

  /** Drop a widget into the scene on screen (palette click / canvas drop). */
  const place = useCallback(
    (widget: Widget, at?: { x: number; y: number }) => {
      const target = canvas?.scenes.find((s) => s.id === canvasSceneId(scene));
      const placed = placeWidget(widget, at, (target?.widgets.length ?? 0) + 1);
      updatePlan(addWidget(plan, scene, placed));
      setPicked({ sceneId: canvasSceneId(scene), widgetId: placed.id });
      setEditingId(null);
    },
    [canvas, plan, scene, updatePlan],
  );

  const insert = useCallback((kind: WidgetKind, at?: { x: number; y: number }) => place(defaultWidget(kind), at), [place]);

  /** Paste a copied element into the scene on screen, nudged so the copy
   *  doesn't hide the original. */
  const paste = useCallback(
    (widget: Widget) => {
      const copy = cloneWidgetWithNewId(widget);
      const { x, y, width, height } = copy.position;
      place({ ...copy, position: { ...copy.position, x: Math.min(1 - width, x + 0.02), y: Math.min(1 - height, y + 0.02) } });
    },
    [place],
  );

  /** An uploaded / stock image or video (a hosted URL) as a new element. The
   *  scene keeps the length the owner chose (plan limits) — a longer clip
   *  plays until the scene ends rather than stretching it like the studio. */
  const insertMedia = useCallback(
    (kind: "image" | "video", url: string, at?: { x: number; y: number }) => place(mediaWidget(kind, url), at),
    [place],
  );

  /** The palette's Screenshot tile (or its drop on the frame): pick a
   *  window, snapshot it, upload it, and add it as an image element. */
  const captureScreenshot = useCallback(
    (at?: { x: number; y: number }) => gatedScreenshot((url) => insertMedia("image", url, at)),
    [gatedScreenshot, insertMedia],
  );

  const insertLinked = useCallback(
    (entityKind: LinkedContentKind, entityId: string, at?: { x: number; y: number }) => {
      if (!canvas) return;
      place(makeLinkedContentWidget({ entityKind, entityId, ...resolveLinkedContentColors(canvas) }), at);
    },
    [canvas, place],
  );

  /** A PropertiesPanel edit — every part of it is kept (frame-edits.ts). */
  const patchWidget = useCallback(
    (widgetId: string, patch: Partial<Widget>) => {
      const current = canvas ? findWidget(canvas, widgetId)?.widget : null;
      if (!current) return;
      // The canvas shows pixel sizes at the export resolution; the plan keeps them at 1080p.
      const result = planWidgetPatch(plan, current, patch, resolutionScale(plan.export?.resolution));
      if (result.plan !== plan) updatePlan(result.plan, `video:props:${widgetId}`);
      if (result.retype !== null) retype(widgetId, result.retype);
    },
    [canvas, plan, updatePlan, retype],
  );

  return {
    selection,
    /** The selected widget + its canvas scene, or null for a scene selection. */
    selected,
    /** The text widget open in the on-frame editor, or null. */
    editing,
    select,
    closeEditor: useCallback(() => setEditingId(null), []),
    /** Select a text element and open it in the on-frame editor at once
     *  (the strip's Text track). */
    editText: useCallback(
      (canvasSceneId: string, widgetId: string) => {
        setPicked({ sceneId: canvasSceneId, widgetId });
        setEditingId(widgetId);
        focusScene(canvasSceneId);
      },
      [focusScene],
    ),
    move,
    reorder,
    retype,
    remove,
    insert,
    paste,
    insertMedia,
    captureScreenshot,
    insertLinked,
    patchWidget,
    uploadGate,
    hasHandEdits: hasCanvasOverrides(plan),
    resetHandEdits: useCallback(() => {
      setPicked(null);
      setEditingId(null);
      updatePlan(resetCanvasOverrides(plan));
    }, [plan, updatePlan]),
  };
}

export type FrameEditor = ReturnType<typeof useFrameEditor>;
