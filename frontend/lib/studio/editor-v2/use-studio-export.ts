/**
 * Export + render for the editor: the per-kind Export (download), the cached
 * Timeline render, and `ensureRendered` — save + render + upload before a
 * publish destination needs a hosted MP4. Lifted out of StudioEditorV2.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MediaKind } from "@shared/media-kinds";
import { useToast } from "@/hooks/use-toast";
import type { StudioProject } from "@/lib/services/studio-service";
import { shouldShowBranding } from "@/lib/studio/branding-policy";
import { hostRenderedVideo, renderCanvasToBlob } from "@/lib/studio/publish-render";
import type { VariantSource } from "@/lib/studio/publish-variants";
import { isProjectBakedFresh } from "@/lib/studio/baked-freshness";
import { exportDocument, type PrintDocument } from "@/lib/studio/document/export-document";
import { flattenCanvasToBlob } from "@/lib/studio/drawing/drawing-engine";
import { useProjectCampaign } from "@/lib/campaigns/use-project-campaign";
import { exportProjectByKind, extensionForBlob } from "./export-facade";
import type { StudioStateSnapshot } from "./format-runtime";
import type { ProjectRecord } from "./use-studio-project-lifecycle";
import type { GateAction } from "./use-anon-adoption";
import type { HandleSave } from "./use-studio-save";

export interface StudioExportInput {
  projectId: string;
  currentMediaKind: MediaKind;
  /** The live runtime state the active kind exports from. */
  snapshot: StudioStateSnapshot;
  /** The image runtime's drawing canvas (flattened for an image export). */
  imageCanvas: HTMLCanvasElement | null;
  record: Pick<
    ProjectRecord,
    "title" | "persistedProject" | "persistedProjectId" | "setPersistedProjectId" | "setPersistedProject"
  >;
  /** Branding-policy inputs — see `shouldShowBranding()`. */
  isPro: boolean;
  removeBranding: boolean;
  gateAction: GateAction;
  handleSave: HandleSave;
  followSavedProject: (id: string) => void;
  /** Popup print for non-résumé documents (components/studio/document/print-document). */
  printDocument: PrintDocument;
}

export function useStudioExport({
  projectId,
  currentMediaKind,
  snapshot,
  imageCanvas,
  record,
  isPro,
  removeBranding,
  gateAction,
  handleSave,
  followSavedProject,
  printDocument,
}: StudioExportInput) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const {
    canvasState: state,
    imageState,
    animationState,
    gameState,
    cadState,
    cad3dState: cad3DState,
    documentState,
    documentEntityContent,
  } = snapshot;
  const { title, persistedProject, persistedProjectId, setPersistedProjectId, setPersistedProject } = record;

  // ───── Export — converts CanvasState → Timeline JSON → `renderTimeline()`
  // (the canvas-v2 effect registry is the single seam for compositing).
  // Closes the historical drift between the V2 player (DOM CanvasStage)
  // and the V2 export (used to translate through V1 scene-graph, which
  // dropped `linked-content` / `cta` widgets and re-laid-out text).
  // Now the export draws every widget through the same `canvas-v2:*`
  // appliers the editor preview will eventually share. Gap #828.
  const [exporting, setExporting] = useState(false);
  // In-memory blob of the most recent render — lets a "Publish" click
  // immediately after a successful export skip re-rendering. Cleared
  // whenever the canvas state mutates (the cached blob would be stale).
  const renderedBlobRef = useRef<Blob | null>(null);
  // The project's campaign (#1138): its UTMs ride on every CTA URL the
  // render reads. A campaign change invalidates the cached render too.
  const campaign = useProjectCampaign(persistedProjectId);
  useEffect(() => {
    renderedBlobRef.current = null;
  }, [state, campaign]);

  async function renderToBlob(): Promise<Blob | null> {
    if (state.scenes.length === 0) return null;
    if (renderedBlobRef.current) return renderedBlobRef.current;
    // Shared with the standalone share modal (lib/studio/publish-render).
    // Branding-policy gate — same source of truth `<BrandWatermark/>` reads
    // on the DOM screen renderer, so the encoded MP4 carries the SAME pill
    // the user sees in /studio + /v/<id>. `isPro` lets the facade enforce
    // `proOnly` export profiles (#1803).
    const blob = await renderCanvasToBlob(state, {
      includeBranding: shouldShowBranding({
        isPro,
        removeBrandingFlag: removeBranding,
      }),
      isPro,
      projectId: persistedProjectId,
      campaign,
    });
    renderedBlobRef.current = blob;
    return blob;
  }

  // Wraps a render-driving callback (`handleExport`, `ensureRendered`,
  // etc.) so any throw surfaces a single shared error toast. The new
  // `renderTimeline()` path uses `OfflineAudioContext` for audio mixing
  // (not a live `AudioContext`), so the V1-era "audio device dropped
  // mid-render" recovery affordance no longer applies — the offline
  // mixer can't fail that way.
  async function withRenderErrorRecovery<T>(
    label: string,
    run: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await run();
    } catch (err) {
      toast({
        title: t("studio.editor.actionFailed", { action: label }),
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      return null;
    }
  }

  /** Export the active project — single entry point. The per-kind
   *  dispatch lives in `exportProjectByKind` (closes the studio-audit
   *  finding that handleExport had three parallel early-return
   *  branches + a second per-kind switch in renderProjectToBlob).
   *  The host supplies the kind-specific callbacks the facade injects
   *  on demand (flattenImage for image kind, renderTimeline for the
   *  Timeline kinds). */
  async function handleExport() {
    if (
      !gateAction(
        "export",
        t("studio.anon.gateExport", {
          defaultValue:
            "Create a free account to export — your draft is saved to your account first.",
        }),
        () => void handleExport(),
      )
    ) {
      return;
    }
    // Document export is a browser print → Save as PDF of the read-only
    // DocumentView (#1912), not a Blob render — "preview === render === print".
    if (currentMediaKind === "document") {
      const ok = await exportDocument(documentState, documentEntityContent, title, printDocument);
      if (!ok) {
        toast({
          title: t("studio.editorV2.printViewFailedTitle"),
          description: t("studio.editorV2.printViewFailedDesc"),
          variant: "destructive",
        });
      }
      return;
    }
    setExporting(true);
    try {
      const blob = await exportProjectByKind({
        mediaKind: currentMediaKind,
        title,
        snapshot: {
          imageState,
          animationState,
          gameState,
          cadState,
          cad3dState: cad3DState,
          canvasState: state,
          flattenImage: imageCanvas
            ? async () => flattenCanvasToBlob(imageCanvas, "image/png")
            : undefined,
          renderTimeline: async () => {
            // Timeline kinds: route through the existing error-recovery
            // wrapper so the heavy render path keeps its toast UX.
            return withRenderErrorRecovery(t("actions.export"), async () => {
              if (state.scenes.length === 0) return null;
              return renderToBlob();
            });
          },
        },
      });
      if (!blob) {
        // Game without a seeded state surfaces a specific toast — the
        // user needs to pick a game template before export means
        // anything. Other null returns mean "nothing to export"
        // (empty timeline / no image canvas yet) and stay silent.
        if (currentMediaKind === "game" && !gameState) {
          toast({
            title: t("studio.editor.saveProjectFirstTitle"),
            description: t("studio.editor.saveProjectFirstGameDesc"),
            variant: "destructive",
          });
        }
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/\s+/g, "-").toLowerCase() || "project"}.${extensionForBlob(blob)}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: t("studio.editor.exportedTitle"), description: t("studio.editor.exportedDesc") });
    } catch (err) {
      toast({
        title: t("messages.exportFailedTitle"),
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  }

  // ───── ensureRendered — V2's parity for v1's `ensureRendered`. Used
  // by every publish destination: kicks off a render + upload when the
  // project doesn't already have a hosted videoUrl, so the user can
  // click "Publish to YouTube" / LinkedIn / Profile on a fresh draft
  // without a separate "Render first" detour. The Save step lands too,
  // so the upload has a project row to attach to. #653.
  async function ensureRendered(): Promise<StudioProject | null> {
    if (state.scenes.length === 0) {
      toast({
        title: t("studio.editor.addWidgetFirstTitle"),
        description: t("studio.editor.addWidgetFirstDesc"),
        variant: "destructive",
      });
      return null;
    }
    // Persist the draft up front so the upload has a project id to
    // attach to. `handleSave` returns the saved row so we don't have
    // to wait on async setState — the closure's `persistedProject`
    // would otherwise be stale on the first publish click of a new
    // project.
    let projectRow = persistedProject;
    if (!persistedProjectId) {
      projectRow = await handleSave();
      if (!projectRow) return null;
    }
    // Re-publish gate: skip the render only when the project's existing
    // baked MP4 is still in sync with the current timeline. The off-
    // platform Publish destinations (YouTube / LinkedIn / Profile /
    // Download) are the only callers that actually need a fresh MP4 —
    // in-platform viewing goes through <StudioPlayer/> which adapts to
    // unrendered projects via the live canvas path automatically.
    if (projectRow && isProjectBakedFresh(projectRow)) return projectRow;

    setExporting(true);
    const result = await withRenderErrorRecovery(t("studio.editor.renderLabel"), async () => {
      try {
        const blob = await renderToBlob();
        if (!blob) return null;
        // Upload + stamp the timeline hash so freshness checks (project
        // tiles, "Unpublished edits") know this render matches the content —
        // shared with the standalone share modal (lib/studio/publish-render).
        projectRow = await hostRenderedVideo({
          blob,
          title,
          state,
          projectId: projectRow?.id ?? persistedProjectId ?? undefined,
          uploadFailedMessage: t("studio.editorV2.uploadFailed"),
        });
        setPersistedProjectId(projectRow.id);
        setPersistedProject(projectRow);
        if (projectId === "new") {
          followSavedProject(projectRow.id);
        }
        return projectRow;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // QUOTA_EXCEEDED isn't an audio error; re-throw with friendly
        // copy so the shared recovery wrapper toasts it under "Render
        // failed" instead of pretending it's a device issue.
        if (/QUOTA_EXCEEDED/i.test(msg)) {
          throw new Error(t("studio.editor.publishQuotaExceeded"));
        }
        throw err;
      }
    });
    setExporting(false);
    return result ?? null;
  }

  /** What a fitted cut (#2045) renders from: the live canvas with the
   *  master's branding and campaign. Null for kinds that post no video. */
  function variantSource(): VariantSource | null {
    if (currentMediaKind !== "video") return null;
    return { state, includeBranding: shouldShowBranding({ isPro, removeBrandingFlag: removeBranding }), campaign };
  }

  return { exporting, renderedBlobRef, handleExport, ensureRendered, variantSource };
}
