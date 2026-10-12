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
 *      Clone project    (not for a career kit's project — its content lives
 *                        on the résumé, so a clone would be empty)
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
import { lazy, Suspense, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { kitResumeId } from "@shared/studio-subject";
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

const PublishTemplateSheet = lazy(
  () => import("@/components/studio/publish-template/PublishTemplateSheet"),
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
  /** Optional "snapshot the current canvas frame" capture (#854). V2 callers
   *  pass a function that renders frame 0 + uploads it, returning the hosted
   *  URL (or null on empty canvas / failure); the publish dialog then offers a
   *  "Use current frame" thumbnail source. Omitted on V1 (no canvas). */
  captureCurrentFrame?: () => Promise<string | null>;
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
  captureCurrentFrame,
}: UseProjectChromeArgs): ProjectChromeSlots {
  const navigate = useNavigate();
  const { t } = useTranslation();
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
        toast({ title: t("studio.chrome.cloned") });
        navigate(`/studio/${encodeURIComponent(res.data.id)}`);
      }
    } catch (err) {
      toast({
        title: t("studio.chrome.cloneFailed"),
        description: err instanceof Error ? err.message : t("errors.unknownError"),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!project) return { items: null, dialogs: null };
  const isKit = kitResumeId(project.subjects) !== null;

  const items = (
    <>
      <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("studio.chrome.templates")}
      </DropdownMenuLabel>
      <DropdownMenuItem onClick={() => setPublishOpen(true)} disabled={busy}>
        <Store className="mr-2 h-3.5 w-3.5" />
        {t("studio.chrome.publishTemplate")}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setMyTemplatesOpen(true)} disabled={busy}>
        <Library className="mr-2 h-3.5 w-3.5" />
        {t("studio.chrome.myTemplates")}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("studio.chrome.project")}
      </DropdownMenuLabel>
      {!isKit && <EntityCloneItem isOwner onClone={busy ? undefined : handleClone} label={t("studio.chrome.clone")} />}
      <DropdownMenuItem
        onClick={() => setConfirmDelete(true)}
        disabled={busy}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className="mr-2 h-3.5 w-3.5" />
        {t("studio.sidebar.deleteProject")}
      </DropdownMenuItem>
    </>
  );

  const dialogs = (
    <>
      <DeleteProjectConfirm
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        projects={[project]}
        onDeleted={([id]) => {
          if (id) onDeleted?.(id);
          navigate("/studio");
        }}
      />

      {publishOpen && (
        <Suspense fallback={null}>
          <PublishTemplateSheet
            open={publishOpen}
            onOpenChange={setPublishOpen}
            projectId={project.id}
            defaultName={project.title}
            mediaKind={project.mediaKind ?? "video"}
            getVideoScript={getVideoScript}
            captureCurrentFrame={captureCurrentFrame}
            onPublished={() => {
              // The sheet already closes on success and toasts. The toast
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
            onEditTemplate={(template) => {
              // #633 — Edit now loads the template's source project into the
              // editor directly instead of just toasting a hint. Templates
              // carry `sourceProjectId`; navigating there opens the live
              // editor on the project the template was published from.
              setMyTemplatesOpen(false);
              if (template.sourceProjectId) {
                navigate(`/studio/${encodeURIComponent(template.sourceProjectId)}`);
              } else {
                toast({
                  title: t("studio.chrome.noSourceTitle"),
                  description: t("studio.chrome.noSourceDesc"),
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
