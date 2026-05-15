/**
 * ProjectChromeMenu — single source of truth for project-lifecycle
 * actions (Clone, Delete, Visibility toggle, Subject chip list) that
 * apply to any saved Studio project regardless of editor kind.
 *
 * Drop one of these into any editor header / sidebar that needs to
 * expose project management without forking the wiring. Self-gating
 * per the DRY rule:
 *   - Returns null when `project` is null (a "new" draft has no
 *     project envelope to manage).
 *   - Delete, Clone, and the Visibility toggle never need `canX` props
 *     from the consumer — the component reads from the StudioProject
 *     row.
 *
 * Side effects route through `studioService.*` so the backend is the
 * source of truth. The component emits a `onChange?(updated)` callback
 * after each mutation so the host can update its local cache (e.g.
 * after clone we navigate to the new project; after delete we navigate
 * away).
 */
import { lazy, Suspense, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Copy,
  Loader2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import VisibilityChip from "@/components/studio/VisibilityChip";
import SubjectChipList from "@/components/studio/SubjectChipList";
import {
  studioService,
  type StudioProject,
} from "@/lib/services/studio-service";
import type { StudioSubjectKind } from "@shared/studio-subject";

const SubjectPickerDialog = lazy(() => import("./SubjectPickerDialog"));

interface Props {
  /** The project to act on. `null` hides the entire menu. */
  project: StudioProject | null;
  /** Fired after any mutation that returned an updated project row.
   *  Hosts use it to refresh their local cache. Clone passes the new
   *  project; delete is signalled via `onDeleted`. */
  onChange?: (project: StudioProject) => void;
  /** Fired after a successful delete. Hosts typically navigate away. */
  onDeleted?: (deletedId: string) => void;
  /** When true, the chip list shows the `× unlink` affordance on each
   *  subject. Adding a NEW subject still requires a deep-link from the
   *  entity host (resume / job / company / profile card) — a generic
   *  picker is gap-registered for follow-up. Defaults to true. */
  enableSubjectLinking?: boolean;
}

export default function ProjectChromeMenu({
  project,
  onChange,
  onDeleted,
  enableSubjectLinking = true,
}: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!project) return null;

  const isPublic = Boolean(project.isPublic);
  const hasVideo = Boolean(project.videoUrl || project.youtubeVideoId);

  async function handleMakePublic(next: boolean) {
    if (!project) return;
    setBusy(true);
    try {
      const res = await studioService.updateProjectVisibility(project.id, next);
      if (res.data) onChange?.(res.data);
      toast({
        title: next ? "Project is public" : "Project is private",
      });
    } catch (err) {
      toast({
        title: "Couldn't update visibility",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

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

  async function handleUnlinkSubject(subject: { kind: StudioSubjectKind; id: string }) {
    if (!project) return;
    try {
      const res = await studioService.unlinkSubject(project.id, {
        kind: subject.kind,
        id: subject.id,
      });
      if (res.data?.subjects && onChange) {
        onChange({
          ...project,
          subjects: res.data.subjects as StudioProject["subjects"],
        });
      }
    } catch (err) {
      toast({
        title: "Couldn't unlink",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  async function handleLinkSubject(subject: { kind: StudioSubjectKind; id: string }) {
    if (!project) return;
    try {
      const res = await studioService.linkSubject(project.id, {
        kind: subject.kind,
        id: subject.id,
      });
      if (res.data?.subjects && onChange) {
        onChange({
          ...project,
          subjects: res.data.subjects as StudioProject["subjects"],
        });
      }
    } catch (err) {
      toast({
        title: "Couldn't link subject",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <VisibilityChip
          isPublic={isPublic}
          busy={busy}
          hasVideo={hasVideo}
          onMakePublic={handleMakePublic}
        />
        <SubjectChipList
          subjects={project.subjects ?? []}
          onUnlink={enableSubjectLinking ? handleUnlinkSubject : undefined}
          onAdd={enableSubjectLinking ? () => setPickerOpen(true) : undefined}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Project actions"
              title="Clone / Delete"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MoreHorizontal className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={handleClone} disabled={busy}>
              <Copy className="mr-2 h-3.5 w-3.5" />
              Clone project
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
      </div>

      {pickerOpen && enableSubjectLinking && (
        <Suspense fallback={null}>
          <SubjectPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            existing={project.subjects ?? []}
            onPick={(subject) => {
              void handleLinkSubject(subject);
            }}
          />
        </Suspense>
      )}

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

    </>
  );
}
