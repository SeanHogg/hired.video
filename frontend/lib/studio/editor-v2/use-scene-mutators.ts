/**
 * Scene + widget mutators for a CanvasState (timeline formats): add /
 * delete / duplicate / reorder scenes, place widgets (palette, drop, linked
 * content, engagement assets), patch a widget's position / params / window
 * / fields, and reorder layers. The single seam every consumer goes
 * through, so undo/redo and autosave see one wire. Selection follows
 * structural edits (a deleted scene's selection moves to a survivor).
 */
import { useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import {
  type CanvasState,
  type Scene,
  type Widget,
  type WidgetKind,
  type WidgetParams,
  type WidgetPosition,
  cloneSceneWithNewIds,
  defaultWidget,
  emptyScene,
  makeEngagementAssetWidget,
  makeLinkedContentWidget,
} from "./canvas-state";
import {
  resolveLinkedContentColors,
  stampEngagementAssetColors,
  type LinkedContentKind,
} from "./linked-content";
import type { EngagementAssetKind } from "./engagement-assets";
import { layerZ } from "./layer-order";
import type { Selection } from "./editor-types";

export interface SceneMutatorsInput {
  state: CanvasState;
  setState: Dispatch<SetStateAction<CanvasState>>;
  activeSceneId: string;
  setActiveSceneId: Dispatch<SetStateAction<string>>;
  setSelection: Dispatch<SetStateAction<Selection>>;
}

export function useSceneMutators({
  state,
  setState,
  activeSceneId,
  setActiveSceneId,
  setSelection,
}: SceneMutatorsInput) {
  const { t } = useTranslation();
  // Read at call time so addScene's label doesn't re-create it per edit.
  const stateRef = useRef(state);
  stateRef.current = state;

  const activeScene = useMemo<Scene>(() => {
    return (
      state.scenes.find((s) => s.id === activeSceneId) ?? state.scenes[0]
    );
  }, [state, activeSceneId]);

  const updateScene = useCallback(
    (sceneId: string, patch: Partial<Scene>) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)),
      }));
    },
    [],
  );

  const addScene = useCallback((): string => {
    // Mint the scene OUTSIDE the updater so the id is stable under
    // strict-mode's double-invoke (mirrors duplicateScene) — the bridge
    // + AI tool need the returned id to reference the new scene.
    const next = emptyScene(t("studio.editorV2.sceneLabel", { number: stateRef.current.scenes.length + 1 }));
    setState((prev) => ({ ...prev, scenes: [...prev.scenes, next] }));
    return next.id;
  }, [t]);

  const deleteScene = useCallback(
    (sceneId: string) => {
      setState((prev) => {
        if (prev.scenes.length <= 1) return prev;
        const next = prev.scenes.filter((s) => s.id !== sceneId);
        return { ...prev, scenes: next };
      });
      setActiveSceneId((current) => {
        if (current !== sceneId) return current;
        const remaining = state.scenes.filter((s) => s.id !== sceneId);
        return remaining[0]?.id ?? current;
      });
      setSelection((current) => {
        if (current.kind === "widget" && current.sceneId === sceneId) {
          const remaining = state.scenes.filter((s) => s.id !== sceneId);
          return { kind: "scene", sceneId: remaining[0]?.id ?? sceneId };
        }
        if (current.kind === "scene" && current.sceneId === sceneId) {
          const remaining = state.scenes.filter((s) => s.id !== sceneId);
          return { kind: "scene", sceneId: remaining[0]?.id ?? sceneId };
        }
        return current;
      });
    },
    [state.scenes],
  );

  const duplicateScene = useCallback(
    (sceneId: string) => {
      // Clone OUTSIDE the setState updater so the new id is stable —
      // React calls updater functions twice under strict mode, which
      // would otherwise mint two different ids and leave the follow-up
      // setActiveSceneId pointing at the wrong one. Mirrors the
      // paste-scene flow in use-canvas-clipboard.ts (DRY).
      const source = state.scenes.find((s) => s.id === sceneId);
      if (!source) return;
      const next = cloneSceneWithNewIds(source);
      next.label = t("studio.editorV2.sceneCopyLabel", { label: source.label });
      setState((prev) => {
        const idx = prev.scenes.findIndex((s) => s.id === sceneId);
        if (idx < 0) return prev;
        const scenes = [...prev.scenes];
        scenes.splice(idx + 1, 0, next);
        return { ...prev, scenes };
      });
      setActiveSceneId(next.id);
      setSelection({ kind: "scene", sceneId: next.id });
    },
    [state.scenes, t],
  );

  const reorderScenes = useCallback((nextOrderIds: string[]) => {
    setState((prev) => {
      const byId = new Map(prev.scenes.map((s) => [s.id, s]));
      return {
        ...prev,
        scenes: nextOrderIds
          .map((id) => byId.get(id))
          .filter((s): s is Scene => Boolean(s)),
      };
    });
  }, []);

  // Place a fully-built widget at an optional drop fraction, append it
  // to the active scene's widget list, and select it. Shared by every
  // "add a widget" pathway (palette click, drag-drop, linked-content
  // tile, media stamps) so anchor math + z-stack assignment + selection
  // live in one place.
  const placeWidget = useCallback(
    (widget: Widget, atFraction?: { x: number; y: number }) => {
      let placed = widget;
      if (atFraction) {
        placed = {
          ...widget,
          position: {
            ...widget.position,
            x: Math.max(
              0,
              Math.min(
                1 - widget.position.width,
                atFraction.x - widget.position.width / 2,
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                1 - widget.position.height,
                atFraction.y - widget.position.height / 2,
              ),
            ),
          },
        };
      }
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((s) =>
          s.id === activeSceneId
            ? {
                ...s,
                widgets: [
                  ...s.widgets,
                  {
                    ...placed,
                    position: { ...placed.position, z: s.widgets.length + 1 },
                  },
                ],
              }
            : s,
        ),
      }));
      setSelection({ kind: "widget", sceneId: activeSceneId, widgetId: placed.id });
    },
    [activeSceneId],
  );

  const insertWidget = useCallback(
    (kind: WidgetKind, atFraction?: { x: number; y: number }) => {
      placeWidget(defaultWidget(kind), atFraction);
    },
    [placeWidget],
  );

  const insertLinkedContent = useCallback(
    (
      entityKind: LinkedContentKind,
      entityId: string,
      atFraction?: { x: number; y: number },
    ) => {
      // Pull the current theme / palette through `resolveLinkedContentColors`
      // so a card dropped onto a themed canvas adopts that theme's
      // chrome immediately — no per-template branching here, the
      // resolver is the single source of truth. Same colours are
      // re-stamped by `applyThemeToState` when the user later switches
      // themes, so the two paths can't drift.
      const colors = resolveLinkedContentColors(state);
      placeWidget(
        makeLinkedContentWidget({ entityKind, entityId, ...colors }),
        atFraction,
      );
    },
    [placeWidget, state],
  );

  const insertEngagementAsset = useCallback(
    (
      assetKind: EngagementAssetKind,
      assetId: string,
      atFraction?: { x: number; y: number },
    ) => {
      // #1587 — stamp the active theme/palette colours at insert time so
      // a form/CTA dropped onto a themed canvas adopts that theme's
      // chrome immediately. Same seam (`stampEngagementAssetColors` →
      // `resolveLinkedContentColors`) that `applyThemeToState` uses to
      // re-stamp on later theme switches, so the two paths can't drift.
      placeWidget(
        makeEngagementAssetWidget(
          stampEngagementAssetColors({ assetKind, assetId }, state),
        ),
        atFraction,
      );
    },
    [placeWidget, state],
  );

  const updateWidgetPosition = useCallback(
    (widgetId: string, position: WidgetPosition) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => ({
          ...scene,
          widgets: scene.widgets.map((w) =>
            w.id === widgetId ? { ...w, position } : w,
          ),
        })),
      }));
    },
    [],
  );

  const updateWidgetParams = useCallback(
    (widgetId: string, params: WidgetParams) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => ({
          ...scene,
          widgets: scene.widgets.map((w) =>
            w.id === widgetId ? { ...w, params } : w,
          ),
        })),
      }));
    },
    [],
  );

  const updateWidgetWindow = useCallback(
    (widgetId: string, visibleFrom: number | null, visibleTo: number | null) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => ({
          ...scene,
          widgets: scene.widgets.map((w) =>
            w.id === widgetId ? { ...w, visibleFrom, visibleTo } : w,
          ),
        })),
      }));
    },
    [],
  );

  // Generic widget patch mutator — used by inspector sections (e.g.
  // Motion, Timing) that mutate Widget-level fields outside of
  // `position` or `params`. Routing through one path keeps undo/redo
  // and autosave on the same wire as the more granular mutators.
  const updateWidget = useCallback(
    (widgetId: string, patch: Partial<Widget>) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => ({
          ...scene,
          widgets: scene.widgets.map((w) =>
            w.id === widgetId ? { ...w, ...patch } : w,
          ),
        })),
      }));
    },
    [],
  );

  // Renumber widget z-indices on a scene from a front-to-back id list.
  // `widgetIdsFrontToBack[0]` ends up with the highest z (front-most);
  // the last id with z 0. Single seam for every "reorder layers" surface
  // (Layers panel today, future inspector "Bring forward"/"Send back"
  // buttons, future keyboard shortcuts) so undo/redo + autosave wrap
  // the change in one history step.
  const reorderLayers = useCallback(
    (sceneId: string, widgetIdsFrontToBack: string[]) => {
      setState((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;
          return {
            ...scene,
            widgets: scene.widgets.map((w) => ({
              ...w,
              position: { ...w.position, z: layerZ(widgetIdsFrontToBack, w.id) },
            })),
          };
        }),
      }));
    },
    [],
  );

  return {
    activeScene,
    updateScene,
    addScene,
    deleteScene,
    duplicateScene,
    reorderScenes,
    placeWidget,
    insertWidget,
    insertLinkedContent,
    insertEngagementAsset,
    updateWidgetPosition,
    updateWidgetParams,
    updateWidgetWindow,
    updateWidget,
    reorderLayers,
  };
}
