/**
 * useCanvasPublisher — publish handlers for a video canvas held OUTSIDE the
 * studio editor (e.g. the kit preview), so a surface can post in place
 * instead of shipping the visitor off and losing what they saw.
 *
 * Produces the same `PublishHandlers` the editor builds (via
 * `usePublishHandlers`), so the shared SharePanel + useSharePanel drive it
 * unchanged. The editor-specific inputs are supplied here:
 *
 *   handleSave      saves the canvas into the project the host names
 *                   (`ensureProjectId` — a career kit's ONE project, found or
 *                   made by the kit itself), updating that row whenever the
 *                   content changed since. The publisher never looks a
 *                   project up or creates one on its own, so it can't fork
 *                   a duplicate.
 *   ensureRendered  save, then render + host the MP4 only when the hosted one
 *                   is stale (shared lib/studio/publish-render)
 *
 * The caller passes the canvas it is SHOWING, so what gets posted is exactly
 * what the visitor watched.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useGuestRun } from "@/hooks/use-guest-run";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { useRemoveBrandingFlag } from "@/lib/studio/use-remove-branding-flag";
import { shouldShowBranding } from "@/lib/studio/branding-policy";
import { isProjectBakedFresh } from "@/lib/studio/baked-freshness";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import { hostRenderedVideo, renderCanvasToBlob } from "./publish-render";
import { usePublishHandlers, type UsePublishHandlersArgs } from "./use-publish-handlers";

export interface UseCanvasPublisherArgs {
  title: string;
  canvasState: CanvasState;
  /** The project this canvas IS — resolved by the host (found, or made
   *  once); null when it can't be yet (no session). */
  ensureProjectId: () => Promise<string | null>;
  /** Draws a publish toast's action button (renderPublishToastAction). */
  renderToastAction: UsePublishHandlersArgs["renderToastAction"];
}

export function useCanvasPublisher({ title, canvasState, ensureProjectId, renderToastAction }: UseCanvasPublisherArgs) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isPro } = useSubscription();
  const { removeBranding } = useRemoveBrandingFlag();
  const runAsGuest = useGuestRun();

  const [project, setProject] = useState<StudioProject | null>(null);
  // Latest values for the async handlers (they outlive a render).
  const projectRef = useRef<StudioProject | null>(null);
  const savedStateRef = useRef<CanvasState | null>(null);
  const blobRef = useRef<{ state: CanvasState; blob: Blob } | null>(null);
  const stateRef = useRef(canvasState);
  stateRef.current = canvasState;
  const ensureRef = useRef(ensureProjectId);
  ensureRef.current = ensureProjectId;

  const remember = useCallback(
    (row: StudioProject) => {
      projectRef.current = row;
      setProject(row);
    },
    [],
  );

  // A new canvas invalidates the cached render.
  useEffect(() => {
    if (blobRef.current && blobRef.current.state !== canvasState) blobRef.current = null;
  }, [canvasState]);

  const handleSave = useCallback(async (): Promise<StudioProject | null> => {
    const state = stateRef.current;
    if (projectRef.current && savedStateRef.current === state) return projectRef.current;
    const projectId = projectRef.current?.id ?? (await ensureRef.current());
    if (!projectId) return null;
    const res = await studioService.saveVideoDraft({ name: title, projectId, canvas: state });
    if (!res.data) return null;
    savedStateRef.current = state;
    remember(res.data);
    return res.data;
  }, [title, remember]);

  const renderBlob = useCallback(async (onProgress?: (progress: number) => void): Promise<Blob | null> => {
    const state = stateRef.current;
    if (blobRef.current?.state === state) return blobRef.current.blob;
    const blob = await renderCanvasToBlob(state, {
      includeBranding: shouldShowBranding({ isPro, removeBrandingFlag: removeBranding }),
      isPro,
      onProgress,
      projectId: projectRef.current?.id ?? null,
    });
    if (blob) blobRef.current = { state, blob };
    return blob;
  }, [isPro, removeBranding]);

  /** Save, render and host the video when the hosted MP4 is missing / stale.
   *  `onProgress` (0..1) follows the render. */
  const ensureRendered = useCallback(async (onProgress?: (progress: number) => void): Promise<StudioProject | null> => {
    try {
      const saved = await handleSave();
      if (!saved) return null;
      if (isProjectBakedFresh(saved)) return saved;
      const blob = await renderBlob(onProgress);
      if (!blob) return null;
      const hosted = await hostRenderedVideo({
        blob,
        title,
        state: stateRef.current,
        projectId: saved.id,
        uploadFailedMessage: t("studio.editorV2.uploadFailed"),
      });
      savedStateRef.current = stateRef.current;
      remember(hosted);
      return hosted;
    } catch (err) {
      toast({
        title: t("studio.editor.actionFailed", { action: t("studio.editor.renderLabel") }),
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      return null;
    }
  }, [handleSave, renderBlob, title, remember, t, toast]);

  // Edited since the last save → hand the publisher no row, so its
  // "ensureSaved" path saves the current content instead of reusing a stale one.
  const upToDate = project && savedStateRef.current === canvasState ? project : null;

  const handlers = usePublishHandlers({
    title,
    persistedProject: upToDate,
    setPersistedProject: remember,
    ensureRendered,
    handleSave,
    gateAction: (_reason, _displayReason, run) => runAsGuest(run),
    refreshPublications: async () => {},
    renderToastAction,
    // Fitted cuts (#2045) render from the canvas being shown, with the master's branding.
    variantSource: () => ({
      state: stateRef.current,
      includeBranding: shouldShowBranding({ isPro, removeBrandingFlag: removeBranding }),
    }),
  });

  return {
    ...handlers,
    /** Saved project id (null until the first save) — enables the AI caption. */
    savedProjectId: project?.id ?? null,
    /** Save the current canvas now (e.g. when the post dock is shown, so the
     *  caption helper has a project to read). */
    save: handleSave,
    /** Save, then render + host the MP4 when stale (e.g. before an embed). */
    ensureRendered,
  };
}
