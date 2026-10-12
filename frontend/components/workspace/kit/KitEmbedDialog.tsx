/**
 * ⋯ › Embed for a career kit (SuperAdmin page→video, #1860): the studio's
 * PageEmbedDialog over the kit's project. Rendering the video first goes
 * through the same canvas publisher the Post panel uses, saving into the
 * kit's ONE project. Mounted only while open.
 */
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { useCanvasPublisher } from "@/lib/studio/use-canvas-publisher";
import { PageEmbedDialog } from "@/components/studio/PageEmbedDialog";
import { renderPublishToastAction } from "@/components/studio/share/publish-toast-action";

interface KitEmbedDialogProps {
  projectId: string;
  ensureProjectId: () => Promise<string | null>;
  title: string;
  canvas: CanvasState;
  rendered: boolean;
  onClose: () => void;
}

export default function KitEmbedDialog({ projectId, ensureProjectId, title, canvas, rendered, onClose }: KitEmbedDialogProps) {
  const publisher = useCanvasPublisher({
    title,
    canvasState: canvas,
    ensureProjectId,
    renderToastAction: renderPublishToastAction,
  });
  return (
    <PageEmbedDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      projectId={projectId}
      rendered={rendered}
      onEnsureRendered={async () => !!(await publisher.ensureRendered())?.videoUrl}
    />
  );
}
