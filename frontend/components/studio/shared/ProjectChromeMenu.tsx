/**
 * useProjectChrome — the project-lifecycle + template-publishing actions
 * for a saved Studio project, packaged so they can be embedded as a
 * "More" group INSIDE another dropdown (the Save split-button) rather than
 * carrying their own `…` overflow trigger.
 *
 * Returns two slots:
 *   - `items`   → the DropdownMenu* rows. Drop these directly inside a
 *                 <DropdownMenuContent>.
 *   - `dialogs` → the publish / templates / delete-confirm surfaces. These
 *                 MUST render OUTSIDE the dropdown content, because Radix
 *                 unmounts <DropdownMenuContent> children when the menu
 *                 closes — and an item click closes the menu. Mount them as
 *                 a sibling of the <DropdownMenu>.
 *
 * Sections (in `items`):
 *   ── Templates ──
 *      Publish as Marketplace Template
 *      My published templates
 *   ── Project ──
 *      Clone project
 *      Delete project   (red)
 *
 * Self-gating per the DRY rule:
 *   - Both slots are `null` when `project` is null (a "new" draft has no
 *     project envelope to manage and nothing to publish), so the host can
 *     `{chrome.items}` / `{chrome.dialogs}` unconditionally.
 *   - Every item's enablement is decided internally — consumers never
 *     thread `canPublish` / `canDelete` booleans.
 *
 * Status chips (visibility, linked subjects) live in <ProjectStatusChips>
 * so headers can place STATUS next to the title and ACTIONS in the Save
 * dropdown without rendering them as a single inseparable cluster.
 *
 * Side effects route through `studioService.*` so the backend stays the
 * source of truth. `onDeleted?(id)` fires once after a successful delete
 * (the hook also navigates to /studio).
 */
import { lazy, Suspense, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Library, Store, Trash2 } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  studioService,
  type StudioProject,
} from "@/lib/services/studio-service";
import DeleteProjectConfirm from "@/components/studio/shared/DeleteProjectConfirm";
import { EntityCloneItem } from "@/components/EntityCloneItem";
import type { ReactNode } from "react";

const PublishAsTemplateDialog = lazy(
  () => import("@/components/studio/PublishAsTemplateDialog"),
);
const CreatorTemplatesPanel = lazy(
  () => import("@/components/studio/CreatorTemplatesPanel"),
);

interface UseProjectChromeArgs {
  /** The project to act on. `null` yields empty slots. */
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

export interface ProjectChromeSlots {
  /** Dropdown rows — render inside a <DropdownMenuContent>. */
  items: ReactNode | null;
  /** Modal surfaces — render OUTSIDE the dropdown content. */
  dialogs: ReactNode | null;
}

export function useProjectChrome({
  project,
  onDeleted,
  getVideoScript,
}: UseProjectChromeArgs): ProjectChromeSlots {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [myTemplatesOpen, setMyTemplatesOpen] = useState(false);

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

  if (!project) return { items: null, dialogs: null };

  const items = (
    <>
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
      <EntityCloneItem isOwner onClone={busy ? undefined : handleClone} label="Clone project" />
      <DropdownMenuItem
        onClick={() => setConfirmDelete(true)}
        disabled={busy}
        className="text-red-500 focus:text-red-500"
      >
        <Trash2 className="mr-2 h-3.5 w-3.5" />
        Delete project
      </DropdownMenuItem>
    </>
  );

  const dialogs = (
    <>
      <DeleteProjectConfirm
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        project={project}
        onDeleted={(id) => {
          onDeleted?.(id);
          navigate("/studio");
        }}
      />

      {publishOpen && (
        <Suspense fallback={null}>
          <PublishAsTemplateDialog
            open={publishOpen}
            onOpenChange={setPublishOpen}
            projectId={project.id}
            defaultName={project.title}
            mediaKind={project.mediaKind ?? "video"}
            getVideoScript={getVideoScript}
            onPublished={() => {
              // The dialog already closes on success and toasts. The toast
              // is easy to miss, so we also auto-open the creator's catalog
              // panel — the user immediately sees their template in the
              // list, which is the unambiguous "it worked" indicator.
              setMyTemplatesOpen(true);
            }}
          />
        </Suspense>
      )}

      {myTemplatesOpen && (
        <Suspense fallback={null}>
          <CreatorTemplatesPanel
            open={myTemplatesOpen}
            onOpenChange={setMyTemplatesOpen}
            onEditTemplate={(t) => {
              // #633 — Edit now loads the template's source project into the
              // editor directly instead of just toasting a hint. Templates
              // carry `sourceProjectId`; navigating there opens the live
              // editor on the project the template was published from.
              setMyTemplatesOpen(false);
              if (t.sourceProjectId) {
                navigate(`/studio/${encodeURIComponent(t.sourceProjectId)}`);
              } else {
                toast({
                  title: "No source project",
                  description:
                    "This template has no source project to edit — edit it from the marketplace listing.",
                });
              }
            }}
          />
        </Suspense>
      )}
    </>
  );

  return { items, dialogs };
}
