// JobPipelineKanban — orchestrates the recruiter kanban for one job.
// Layout + DnD wiring + dialog hosts only; data fetching lives in
// useJobPipeline; toolbar + columns are their own components; pure
// snapshot mutations live in lib/recruit/pipeline-mutations.

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Loader2, Plus, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useJobPipeline } from "@/hooks/use-job-pipeline";
import { useCanManageJobPipeline } from "@/hooks/use-job-permissions";
import { findEntryStage } from "@/lib/recruit/pipeline-mutations";
import { buildCsv, downloadCsv } from "@/lib/utils/csv";
import { PIPELINE_STAGES, type PipelineStage } from "@shared/recruiter-pipeline";
import type { PipelineSnapshot } from "@/lib/services/job-pipeline-service";
import KanbanToolbar from "@/components/recruit/KanbanToolbar";
import KanbanColumn from "@/components/recruit/KanbanColumn";
import AddPipelineCandidateDialog from "@/components/recruit/AddPipelineCandidateDialog";
import PipelineShareDialog from "@/components/recruit/PipelineShareDialog";
import BulkAddToListDialog from "@/components/recruit/BulkAddToListDialog";

interface JobPipelineKanbanProps {
  jobId: string;
  /** Job ownership snapshot — passed in so the panel can self-gate
   *  without refetching. `viewerCanManage` is the backend-authoritative
   *  flag from the job DTO; the panel returns `null` when neither
   *  owner-match nor that flag entitles the viewer. */
  jobOwner?: { userId?: string | null; viewerCanManage?: boolean } | null;
  onCountChange?: (total: number) => void;
}

/**
 * Outer gate. Self-gates on the backend-stamped `viewerCanManage` flag
 * (plus owner fast-path) so JobDetail no longer prop-drills a
 * `canManagePipeline` boolean and the gate can't drift from the
 * backend's `requireJobOwner` rule. Returning `null` here keeps every
 * hook inside the inner component on a stable order.
 */
export default function JobPipelineKanban(props: JobPipelineKanbanProps) {
  const canManage = useCanManageJobPipeline(props.jobOwner);
  if (!canManage) return null;
  return <PipelineKanbanInner {...props} />;
}

function PipelineKanbanInner({ jobId, onCountChange }: JobPipelineKanbanProps) {
  const { t } = useTranslation();
  const {
    snapshot,
    loading,
    moveStage,
    bulkMoveStage,
    addCandidate,
    removeCandidate,
  } = useJobPipeline(jobId, onCountChange);

  const [collapsed, setCollapsed] = useState<Set<PipelineStage>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);

  const sensors = useSensors(
    // 6px threshold lets click handlers (checkbox / move dropdown) still
    // fire reliably before a drag activates.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const toggleCollapsed = (stage: PipelineStage) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  const handleToggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkMove = (stage: PipelineStage) => {
    const ids = Array.from(selected);
    setSelected(new Set());
    void bulkMoveStage(ids, stage);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const entryId = event.active.id as string;
    const targetStage = event.over?.id as PipelineStage | undefined;
    if (!targetStage || !PIPELINE_STAGES.includes(targetStage)) return;
    if (!snapshot) return;
    const currentStage = findEntryStage(snapshot, entryId);
    if (!currentStage || currentStage === targetStage) return;
    void moveStage(entryId, targetStage);
  };

  const visibleStages = useMemo(
    () => snapshot?.stages.filter((g) => g.stage !== "rejected" || g.count > 0) ?? [],
    [snapshot],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        {t("status.loadingPipeline")}
      </div>
    );
  }

  if (!snapshot || snapshot.total === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-10 text-center">
        <UserCheck className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-semibold">{t("messages.noCandidatesInPipeline")}</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          {t("messages.addPeopleEmptyDesc")}
        </p>
        <div className="flex justify-center gap-2 mt-4">
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            {t("actions.addPeople")}
          </Button>
        </div>
        <AddPipelineCandidateDialog open={addOpen} onOpenChange={setAddOpen} onAdd={async (input) => {
          await addCandidate(input);
        }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <KanbanToolbar
        selectionCount={selected.size}
        onClearSelection={() => setSelected(new Set())}
        onBulkMove={handleBulkMove}
        onAddToList={() => setAddToListOpen(true)}
        onExport={() => exportPipelineCsv(snapshot)}
        onPrint={() => window.print()}
        onShare={() => setShareOpen(true)}
        onAddPeople={() => setAddOpen(true)}
      />

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {visibleStages.map((group) => (
            <KanbanColumn
              key={group.stage}
              group={group}
              collapsed={collapsed.has(group.stage)}
              onToggleCollapsed={() => toggleCollapsed(group.stage)}
              selected={selected}
              onToggleSelect={handleToggleSelect}
              onMoveStage={moveStage}
              onRemove={removeCandidate}
            />
          ))}
        </div>
      </DndContext>

      <AddPipelineCandidateDialog open={addOpen} onOpenChange={setAddOpen} onAdd={async (input) => {
          await addCandidate(input);
        }} />
      <PipelineShareDialog open={shareOpen} onOpenChange={setShareOpen} jobId={jobId} />
      <BulkAddToListDialog
        open={addToListOpen}
        onOpenChange={setAddToListOpen}
        entryIds={Array.from(selected)}
      />
    </div>
  );
}

function exportPipelineCsv(snapshot: PipelineSnapshot): void {
  const header = ["stage", "name", "email", "phone", "location", "tags", "stageChangedAt", "addedFrom"];
  const rows = snapshot.stages.flatMap((g) =>
    g.entries.map((e) => [
      g.stage,
      e.candidateName,
      e.candidateEmail ?? "",
      e.candidatePhone ?? "",
      e.candidateLocation ?? "",
      (e.tags ?? []).join("; "),
      e.stageChangedAt,
      e.addedFrom,
    ]),
  );
  const filename = `pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
  downloadCsv(filename, buildCsv(header, rows));
}
