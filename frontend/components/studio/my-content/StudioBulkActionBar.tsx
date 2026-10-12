/**
 * StudioBulkActionBar — the "N selected · Select all · Merge · Delete ·
 * Clear" bar over /studio "My content". Self-gating: renders nothing when
 * nothing is selected. Owns its two dialogs (bulk delete confirm + merge)
 * and decides Merge eligibility itself via `mergeBlocker`, so the page only
 * hands it the selected projects and reacts to the outcomes.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Combine, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import DeleteProjectConfirm from "@/components/studio/shared/DeleteProjectConfirm";
import type { StudioProject } from "@/lib/services/studio-service";
import { mergeBlocker } from "@/lib/studio/merge-studio-projects";
import MergeProjectsDialog from "./MergeProjectsDialog";

interface Props {
  /** Selected projects, in selection order (= default merge order). */
  selected: readonly StudioProject[];
  /** Size of the currently filtered list — drives "Select all (N)". */
  totalCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onDeleted: (deletedIds: string[]) => void;
  onMerged: (merged: StudioProject) => void;
}

export default function StudioBulkActionBar({
  selected,
  totalCount,
  onSelectAll,
  onClear,
  onDeleted,
  onMerged,
}: Props) {
  const { t } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  if (selected.length === 0 && !confirmDelete && !mergeOpen) return null;

  const blocker = mergeBlocker(selected);
  const mergeHint = blocker ? t(`messages.studioMerge.blocked.${blocker}`) : undefined;

  return (
    <>
      {selected.length > 0 && (
        <div
          role="toolbar"
          aria-label={t("labels.studioLanding.bulkActionsAria")}
          className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-primary/40 bg-accent px-3 py-2"
        >
          <span className="text-sm font-medium">
            {t("labels.selectedCount", { count: selected.length })}
          </span>
          {selected.length < totalCount && (
            <Button variant="link" size="sm" className="h-auto px-1" onClick={onSelectAll}>
              {t("actions.studioLanding.selectAll", { count: totalCount })}
            </Button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={blocker !== null}
              title={mergeHint}
              onClick={() => setMergeOpen(true)}
            >
              <Combine className="mr-1.5 h-3.5 w-3.5" />
              {t("actions.studioMerge.merge")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t("actions.delete")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              aria-label={t("labels.studioLanding.clearSelectionAria")}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              {t("actions.clear")}
            </Button>
          </div>
          {mergeHint && selected.length > 1 && (
            <p className="w-full text-xs text-muted-foreground">{mergeHint}</p>
          )}
        </div>
      )}
      <DeleteProjectConfirm
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        projects={selected}
        onDeleted={onDeleted}
      />
      <MergeProjectsDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        projects={selected}
        onMerged={onMerged}
      />
    </>
  );
}
