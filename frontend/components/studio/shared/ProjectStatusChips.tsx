/**
 * ProjectStatusChips — the visibility + linked-subject chip row for a
 * saved studio project. Self-gates (returns null when there's no project)
 * and owns the service calls for visibility toggle + subject unlink, so
 * any header can drop one in without re-wiring handlers.
 *
 * Lifted out of ProjectChromeMenu so the editor header can place STATUS
 * chips alongside the title and keep the overflow `…` menu purely for
 * ACTIONS (clone, delete, publish-as-template, my-templates). Sharing the
 * chip row also keeps any future editor surface DRY — chip rendering +
 * the handlers that mutate them live in exactly one place.
 */
import VisibilityChip from "@/components/studio/VisibilityChip";
import SubjectChipList from "@/components/studio/SubjectChipList";
import { useToast } from "@/hooks/use-toast";
import {
  studioService,
  type StudioProject,
} from "@/lib/services/studio-service";
import type { StudioSubjectKind } from "@shared/studio-subject";
import { lazy, Suspense, useState } from "react";

const SubjectPickerDialog = lazy(() => import("./SubjectPickerDialog"));

interface Props {
  project: StudioProject | null;
  onChange?: (project: StudioProject) => void;
  /** When true (default), the chip list shows the `× unlink` affordance
   *  AND a `+ Link` affordance that opens the SubjectPickerDialog. */
  enableSubjectLinking?: boolean;
}

export default function ProjectStatusChips({
  project,
  onChange,
  enableSubjectLinking = true,
}: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!project) return null;

  const isPublic = Boolean(project.isPublic);

  async function handleMakePublic(next: boolean) {
    if (!project) return;
    setBusy(true);
    try {
      const res = await studioService.updateProjectVisibility(project.id, next);
      if (res.data) onChange?.(res.data);
      toast({ title: next ? "Project is public" : "Project is private" });
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
          onMakePublic={handleMakePublic}
        />
        <SubjectChipList
          subjects={project.subjects ?? []}
          onUnlink={enableSubjectLinking ? handleUnlinkSubject : undefined}
          onAdd={enableSubjectLinking ? () => setPickerOpen(true) : undefined}
        />
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
    </>
  );
}
