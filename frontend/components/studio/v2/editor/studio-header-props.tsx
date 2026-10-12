/**
 * The studio editor's header wiring: title, autosave + collab status, the
 * kind's history + Preview, the ⋯ Save menu (export, publish destinations,
 * the kind's own rows) and Post. Composes StudioHeader's props at render
 * time. Lifted out of StudioEditorV2.
 */
import type { ComponentProps, Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import { Download } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type StudioHeader from "@/components/workspace/studio/StudioHeader";
import type { HeaderPreview } from "@/components/workspace/WorkspaceHeader";
import { mediaKindUsesCanvasStateAuthoring, type MediaKind } from "@shared/media-kinds";
import type { StudioPublication } from "@/lib/services/studio-service";
import { uploadImage } from "@/lib/services/upload-service";
import { isSuperAdminFromToken } from "@/lib/auth-claims";
import { canPostKind } from "@/lib/studio/share-channels";
import { downloadRobloxFile } from "@/lib/studio/game/roblox-export";
import type { PublishHandlers } from "@/lib/studio/use-publish-handlers";
import type { HistoryControls } from "@/lib/workspace/use-undo-shortcuts";
import type { WorkspaceDepthControls } from "@/lib/workspace/use-workspace-depth";
import { canvasStateToScript } from "@/lib/studio/editor-v2/canvas-to-script";
import { stripDocumentContent } from "@/lib/studio/editor-v2/document-templates";
import { captureCanvasThumbnail, dataUrlToBlob } from "@/lib/studio/editor-v2/capture-thumbnail";
import type { AutosaveStatus } from "@/lib/studio/editor-v2/use-server-autosave";
import type { ImageRuntime } from "@/lib/studio/editor-v2/use-image-runtime";
import { formatRuntimeFor, type StudioStateSnapshot } from "@/lib/studio/editor-v2/format-runtime";
import type { ProjectRecord } from "@/lib/studio/editor-v2/use-studio-project-lifecycle";
import type { StudioDialogs } from "@/lib/studio/editor-v2/use-studio-dialogs";
import type { HandleSave } from "@/lib/studio/editor-v2/use-studio-save";

type StudioHeaderProps = ComponentProps<typeof StudioHeader>;

export interface StudioHeaderPropsInput {
  t: TFunction;
  currentMediaKind: MediaKind;
  record: Pick<ProjectRecord, "title" | "setTitle" | "persistedProject" | "setPersistedProject" | "persistedProjectId">;
  autosaveStatus: AutosaveStatus;
  collab: StudioHeaderProps["collab"];
  history: HistoryControls;
  preview: HeaderPreview | null;
  depth: WorkspaceDepthControls;
  publications: StudioPublication[];
  refreshPublications: () => void;
  /** The live runtime state (publish snapshot, thumbnail, content check). */
  snapshot: StudioStateSnapshot;
  /** The image runtime's save-to-asset-library row. */
  imageLibrary: Pick<ImageRuntime, "savingImageToLibrary" | "imageCanvas" | "handleSaveImageToLibrary">;
  saving: boolean;
  handleSave: HandleSave;
  exporting: boolean;
  handleExport: () => Promise<void>;
  publisher: PublishHandlers;
  dialogs: StudioDialogs;
  shareOpen: boolean;
  setShareOpen: Dispatch<SetStateAction<boolean>>;
}

export function studioHeaderProps({
  t,
  currentMediaKind,
  record,
  autosaveStatus,
  collab,
  history,
  preview,
  depth,
  publications,
  refreshPublications,
  snapshot,
  imageLibrary,
  saving,
  handleSave,
  exporting,
  handleExport,
  publisher,
  dialogs,
  shareOpen,
  setShareOpen,
}: StudioHeaderPropsInput): StudioHeaderProps {
  const { title, setTitle, persistedProject, setPersistedProject, persistedProjectId } = record;
  const { canvasState: state, documentState } = snapshot;
  const { savingImageToLibrary, imageCanvas, handleSaveImageToLibrary } = imageLibrary;
  const formatRuntime = formatRuntimeFor(currentMediaKind);
  // The 3D world's state when this is one (Roblox export + invites).
  const world3d = formatRuntime.world3d(snapshot);
  return {
    title,
    onTitleChange: setTitle,
    autosaveStatus,
    collab,
    history,
    preview,
    depth,
    project: persistedProject,
    onProjectChange: setPersistedProject,
    publications,
    onRefreshPublications: refreshPublications,
    getVideoScript: () =>
      // The publish payload is the kind's reusable snapshot: the
      // content-stripped DocumentState for documents, else a VideoScript.
      currentMediaKind === "document" ? stripDocumentContent(documentState) : canvasStateToScript(state),
    // Template thumbnail (#854) — CanvasState-authoring kinds only.
    captureCurrentFrame: mediaKindUsesCanvasStateAuthoring(currentMediaKind)
      ? async () => {
          const dataUrl = await captureCanvasThumbnail(state);
          if (!dataUrl) return null;
          return uploadImage(dataUrlToBlob(dataUrl), "template-thumbnail.jpg");
        }
      : undefined,
    saveMenu: {
      saving,
      onSave: () => void handleSave(),
      // Per-kind content predicate from LOCAL kind-state so an
      // in-editor change enables Export without a save round-trip.
      hasContent: formatRuntime.hasContent(snapshot),
      // The LIVE kind, so a document draft never offers video rows.
      mediaKind: currentMediaKind,
      projectId: persistedProjectId,
      slug: persistedProject?.slug ?? null,
      hasVideo: !!persistedProject?.videoUrl,
      isPublishedToProfile: persistedProject?.status === "Published",
      onExport: () => void handleExport(),
      exporting,
      publishHandlers: {
        ...publisher.menu,
        // Image → asset library (#933); unbound rows self-disable.
        ...(currentMediaKind === "image" && !savingImageToLibrary && !!imageCanvas
          ? { "asset-library": handleSaveImageToLibrary }
          : {}),
        // Course lesson (#160) needs a real project id.
        ...(persistedProjectId ? { "course-lesson": () => dialogs.setAttachToCourseOpen(true) } : {}),
      },
      publications,
      onRepublish: publisher.handleRepublish,
      republishing: publisher.republishing,
      kindItems: world3d ? (
        <DropdownMenuItem onSelect={() => downloadRobloxFile(world3d, `${title || "hired-world"}.rbxlx`)}>
          <Download className="mr-2 h-3.5 w-3.5" />
          {t("workspace.more.roblox")}
        </DropdownMenuItem>
      ) : null,
    },
    onCourseLesson: persistedProjectId ? () => dialogs.setAttachToCourseOpen(true) : null,
    onVersions: null,
    onEmbed: persistedProjectId && isSuperAdminFromToken() ? () => dialogs.setEmbedDialogOpen(true) : null,
    onInvite: world3d ? () => dialogs.setGameInviteOpen(true) : null,
    post: canPostKind(currentMediaKind)
      ? {
          label: currentMediaKind === "video" ? t("studio.focus.postVideo") : t("studio.focus.post"),
          onClick: () => setShareOpen((o) => !o),
          expanded: shareOpen,
        }
      : null,
  };
}
