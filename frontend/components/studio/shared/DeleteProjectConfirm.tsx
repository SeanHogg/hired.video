/**
 * DeleteProjectConfirm — controlled confirm dialog for deleting a Studio
 * project. Owns the AlertDialog, the `deleteProject` API call, the busy
 * state, and the success/error toasts so every "delete this project"
 * surface (overflow menu in the editor, hover trash on the landing card,
 * and any future surface) shares one implementation.
 *
 * Trigger UI lives at the call site (kebab menu item, hover button, etc.)
 * and just flips `open` to true.
 */
import { useState } from "react";
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
  project: { id: string; title: string } | null;
  onDeleted?: (deletedId: string) => void;
}

export default function DeleteProjectConfirm({
  open,
  onOpenChange,
  project,
  onDeleted,
}: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!project) return;
    setBusy(true);
    try {
      await studioService.deleteProject(project.id);
      toast({ title: "Project deleted" });
      onDeleted?.(project.id);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Couldn't delete project",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete "{project?.title ?? "project"}"?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the project, its draft, and any
            uploaded media. Published copies on external platforms
            (YouTube, LinkedIn) are not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={busy || !project}
            className="bg-red-500 hover:bg-red-600"
          >
            {busy ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
