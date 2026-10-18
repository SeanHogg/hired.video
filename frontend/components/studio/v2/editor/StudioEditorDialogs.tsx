/**
 * The studio editor's modal surfaces, mounted once at the editor root:
 * Save as Course Lesson, the SuperAdmin page embed, the Timeline + document
 * preview overlays, and the 3D-world invite. Open state lives in
 * `useStudioDialogs`. Lifted out of StudioEditorV2.
 */
import AttachToCourseDialog from "@/components/creator/AttachToCourseDialog";
import { PageEmbedDialog } from "@/components/studio/PageEmbedDialog";
import PreviewOverlay from "@/components/studio/v2/PreviewOverlay";
import DocumentPreviewOverlay from "@/components/studio/document/DocumentPreviewOverlay";
import InviteDialog from "@/components/studio/game/world-3d/InviteDialog";
import { mediaKindIsDocument, type MediaKind } from "@shared/media-kinds";
import type { GameState } from "@shared/game-state";
import type { StudioProject } from "@/lib/services/studio-service";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import type { PreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import type { DocumentRuntime } from "@/lib/studio/editor-v2/use-history-runtimes";
import type { StudioDialogs } from "@/lib/studio/editor-v2/use-studio-dialogs";
import { savedProjectIdFromRoute } from "@/lib/studio/editor-v2/use-studio-project-lifecycle";

export interface StudioEditorDialogsProps {
  dialogs: StudioDialogs;
  currentMediaKind: MediaKind;
  /** The route id — "new" for an unsaved draft. */
  projectId: string;
  title: string;
  persistedProjectId: string | null;
  persistedProject: StudioProject | null;
  state: CanvasState;
  playback: PreviewPlayback;
  documentRuntime: DocumentRuntime;
  gameState: GameState | null;
  /** `?embedPath=` — the embed dialog's default marketing page. */
  embedPath: string | null;
  ensureRendered: () => Promise<StudioProject | null>;
}

export default function StudioEditorDialogs({
  dialogs,
  currentMediaKind,
  projectId,
  title,
  persistedProjectId,
  persistedProject,
  state,
  playback,
  documentRuntime,
  gameState,
  embedPath,
  ensureRendered,
}: StudioEditorDialogsProps) {
  const { documentState, documentEntityContent } = documentRuntime;

  return (
    <>
      {/* Save as Course Lesson — see [AttachToCourseDialog](../../../creator/AttachToCourseDialog.tsx)
          and the SaveMenuV2 publish-handler wiring in the header. Self-fetches
          the user's courses; renders a "Create a course" CTA when the list is
          empty. */}
      <AttachToCourseDialog
        open={dialogs.attachToCourseOpen}
        onOpenChange={dialogs.setAttachToCourseOpen}
        studioProjectId={persistedProjectId}
        defaultTitle={persistedProject?.title ?? undefined}
      />
      {/* SuperAdmin page→video embed (#1860) — publish onto a marketing
          page and/or copy an external snippet. Only reachable via the
          SuperAdmin-gated Embed button in the header. */}
      {dialogs.embedDialogOpen && persistedProjectId && (
        <PageEmbedDialog
          open={dialogs.embedDialogOpen}
          onOpenChange={dialogs.setEmbedDialogOpen}
          projectId={persistedProjectId}
          rendered={!!persistedProject?.videoUrl}
          defaultPathname={embedPath ?? undefined}
          onEnsureRendered={async () => {
            const project = await ensureRendered();
            return !!project?.videoUrl;
          }}
        />
      )}
      {dialogs.previewOpen && (
        <PreviewOverlay
          state={state}
          playback={playback}
          projectId={persistedProjectId}
          onClose={() => dialogs.setPreviewOpen(false)}
        />
      )}
      {dialogs.docPreviewOpen && mediaKindIsDocument(currentMediaKind) && (
        <DocumentPreviewOverlay
          state={documentState}
          content={documentEntityContent}
          title={title}
          onClose={() => dialogs.setDocPreviewOpen(false)}
        />
      )}
      {/* 3D-world Invite dialog — modal mounted at the editor root so
          the InviteDialog's full-screen backdrop overlays everything.
          Trigger lives in the EditorHeader; this is the receiver. */}
      {dialogs.gameInviteOpen && gameState?.engine === "world-3d" && (
        <InviteDialog
          projectId={savedProjectIdFromRoute(projectId)}
          onClose={() => dialogs.setGameInviteOpen(false)}
        />
      )}
    </>
  );
}
