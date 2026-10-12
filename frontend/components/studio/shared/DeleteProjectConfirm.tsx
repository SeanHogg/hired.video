/**
 * DeleteProjectConfirm — controlled confirm dialog for deleting one OR
 * MANY Studio projects. Owns the AlertDialog, the `deleteProject` API
 * calls, the busy state, and the success/error toasts so every "delete"
 * surface (overflow menu in the editor, hover trash on the landing card,
 * the /studio bulk-selection bar) shares one implementation.
 *
 * Trigger UI lives at the call site (kebab menu item, hover button, bulk
 * bar) and just flips `open` to true. Bulk deletes fan out with
 * `Promise.allSettled` so a partial failure still removes the successes;
 * `onDeleted` receives only the ids that were actually deleted.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { studioService } from "@/lib/services/studio-service";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ReadonlyArray<{ id: string; title: string }>;
  onDeleted?: (deletedIds: string[]) => void;
}

export default function DeleteProjectConfirm({
  open,
  onOpenChange,
  projects,
  onDeleted,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const single = projects.length === 1 ? projects[0] : null;

  async function handleDelete() {
    if (projects.length === 0) return;
    setBusy(true);
    const results = await Promise.allSettled(
      projects.map((p) => studioService.deleteProject(p.id)),
    );
    const deletedIds = projects
      .filter((_, i) => results[i].status === "fulfilled")
      .map((p) => p.id);
    const failed = projects.length - deletedIds.length;
    if (deletedIds.length > 0) {
      toast({
        title: single
          ? t("messages.studioDelete.deleted")
          : t("messages.deletedProjectsCount", { count: deletedIds.length }),
        ...(failed > 0
          ? { description: t("messages.bulkDeletedFailedSuffix", { count: failed }) }
          : {}),
      });
      onDeleted?.(deletedIds);
    } else {
      const firstError = results.find((r) => r.status === "rejected");
      toast({
        title: single
          ? t("errors.failedToDeleteProject")
          : t("errors.failedToDeleteProjectsCount", { count: failed }),
        description:
          firstError?.status === "rejected" && firstError.reason instanceof Error
            ? firstError.reason.message
            : t("errors.unknownErrorAdmin"),
        variant: "destructive",
      });
    }
    setBusy(false);
    if (deletedIds.length > 0) onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {single
              ? t("messages.studioDelete.titleOne", { title: single.title })
              : t("messages.confirmDeleteProjectsTitle", { count: projects.length })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("messages.studioDelete.body", { count: projects.length })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Keep the dialog open while the request is in flight; it
              // closes itself on success.
              e.preventDefault();
              void handleDelete();
            }}
            disabled={busy || projects.length === 0}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? t("status.deleting") : t("actions.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
