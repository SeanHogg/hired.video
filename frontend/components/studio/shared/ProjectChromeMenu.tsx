/**
 * ProjectChromeMenu — the single overflow `…` menu for a saved Studio
 * project. Bundles ALL project-lifecycle and template-publishing actions
 * into one dropdown so editor headers expose exactly ONE overflow trigger
 * (was two adjacent identical `…` glyphs — bad UX, now consolidated).
 *
 * Sections:
 *   ── Templates ──
 *      Publish as Marketplace Template
 *      My published templates
 *   ── Project ──
 *      Clone project
 *      Delete project   (red)
 *
 * Self-gating per the DRY rule:
 *   - Returns null when `project` is null (a "new" draft has no project
 *     envelope to manage and nothing to publish).
 *   - Every item's enablement is decided internally — consumers never
 *     thread `canPublish` / `canDelete` booleans.
 *
 * Status chips (visibility, linked subjects) used to live here too; they
 * moved out to <ProjectStatusChips> so headers can place STATUS next to
 * the title and ACTIONS in this overflow without rendering them as a
 * single inseparable cluster.
 *
 * Side effects route through `studioService.*` so the backend stays the
 * source of truth. The component emits `onChange?(updated)` after each
 * mutation so the host can refresh its local cache; `onDeleted?(id)` fires
 * once after a successful delete (the menu also navigates to /studio).
 */
import { lazy, Suspense, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Copy,
  Library,
  Loader2,
  MoreHorizontal,
  Store,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  studioService,
  type StudioProject,
} from "@/lib/services/studio-service";

const PublishAsTemplateDialog = lazy(
  () => import("@/components/studio/PublishAsTemplateDialog"),
);
const CreatorTemplatesPanel = lazy(
  () => import("@/components/studio/CreatorTemplatesPanel"),
);

interface Props {
  /** The project to act on. `null` hides the entire menu. */
  project: StudioProject | null;
  /** Fired after a successful delete. Hosts typically navigate away. */
  onDeleted?: (deletedId: string) => void;
  /** Optional inline VideoScript getter. V2 callers pass
   *  `() => canvasStateToScript(state)` so the V2 project row doesn't
   *  duplicate the v1 storyboard column on every save (#637). When
   *  omitted, the backend reads from `project.storyboard` — V1 publish
   *  path is unchanged. */
  getVideoScript?: () => unknown;
}

export default function ProjectChromeMenu({
  project,
  onDeleted,
  getVideoScript,
}: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [myTemplatesOpen, setMyTemplatesOpen] = useState(false);

  if (!project) return null;

  async function handleClone() {
    if (!project) return;
    setBusy(true);
    try {
      const res = await studioService.cloneProject(project.id);
      if (res.data?.id) {
        toast({ title: "Project cloned" });
        navigate(`/studio/${encodeURIComponent(res.data.id)}`);
      }
    } catch (err) {
      toast({
        title: "Couldn't clone project",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!project) return;
    setBusy(true);
    try {
      await studioService.deleteProject(project.id);
      toast({ title: "Project deleted" });
      onDeleted?.(project.id);
      setConfirmDelete(false);
      navigate("/studio");
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
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            aria-label="Project actions"
            title="Publish · Clone · Delete"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Templates
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setPublishOpen(true)} disabled={busy}>
            <Store className="mr-2 h-3.5 w-3.5" />
            Publish as Marketplace Template
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMyTemplatesOpen(true)} disabled={busy}>
            <Library className="mr-2 h-3.5 w-3.5" />
            My published templates
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Project
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={handleClone} disabled={busy}>
            <Copy className="mr-2 h-3.5 w-3.5" />
            Clone project
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            className="text-red-500 focus:text-red-500"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{project.title}"?</AlertDialogTitle>
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
              disabled={busy}
              className="bg-red-500 hover:bg-red-600"
            >
              {busy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {publishOpen && (
        <Suspense fallback={null}>
          <PublishAsTemplateDialog
            open={publishOpen}
            onOpenChange={setPublishOpen}
            projectId={project.id}
            defaultName={project.title}
            getVideoScript={getVideoScript}
          />
        </Suspense>
      )}

      {myTemplatesOpen && (
        <Suspense fallback={null}>
          <CreatorTemplatesPanel
            open={myTemplatesOpen}
            onOpenChange={setMyTemplatesOpen}
            onEditTemplate={(t) => {
              // Loading the source project into the editor is a separate
              // follow-up flow (#633). For now the panel closes and points
              // the user at their Recent list.
              setMyTemplatesOpen(false);
              toast({
                title: "Open template to edit",
                description: t.sourceProjectId
                  ? "Switch to the source project from Recent to keep editing."
                  : "Templates without a source project can be edited from the marketplace listing.",
              });
            }}
          />
        </Suspense>
      )}
    </>
  );
}
