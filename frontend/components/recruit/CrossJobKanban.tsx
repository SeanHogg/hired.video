// CrossJobKanban — the cross-job recruiter pipeline board (#405). Shows every
// candidate across all the viewer's manageable jobs grouped by stage, so a
// recruiter works the whole desk in one place instead of clicking into each
// job's per-job pipeline. Composes the same KanbanColumn / JobPipelineCard /
// DnD wiring as the per-job board (JobPipelineKanban) — only the data source
// (`GET /api/pipeline` without a jobId) differs, handled by
// useCrossJobPipeline. Self-gates on `canManageJobs` so the host page never
// has to prop-drill a permission boolean.

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Briefcase, Download, Loader2, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/hooks/use-permissions";
import { useCrossJobPipeline } from "@/hooks/use-cross-job-pipeline";
import { findEntryStage } from "@/lib/recruit/pipeline-mutations";
import { buildCsv, downloadCsv } from "@/lib/utils/csv";
import { PIPELINE_STAGES, type PipelineStage } from "@shared/recruiter-pipeline";
import type { CrossJobPipelineSnapshot } from "@/lib/services/job-pipeline-service";
import KanbanColumn from "@/components/recruit/KanbanColumn";

export default function CrossJobKanban() {
  const { canManageJobs } = usePermissions();
  if (!canManageJobs) return null;
  return <CrossJobKanbanInner />;
}

function CrossJobKanbanInner() {
  const { t } = useTranslation();
  const [jobFilter, setJobFilter] = useState<string>("all");
  const { snapshot, loading, moveStage, removeCandidate } = useCrossJobPipeline({
    jobId: jobFilter === "all" ? undefined : jobFilter,
  });

  const [collapsed, setCollapsed] = useState<Set<PipelineStage>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sensors = useSensors(
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

  // Bulk move fans out to each entry's own job via moveStage (which already
  // targets entry.jobId) — no cross-job-specific server path needed.
  const handleBulkMove = (stage: PipelineStage) => {
    const ids = Array.from(selected);
    setSelected(new Set());
    for (const id of ids) void moveStage(id, stage);
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

  const jobs = snapshot?.jobs ?? [];

  if (!snapshot || snapshot.total === 0) {
    // Distinguish "no candidates anywhere" from "the chosen job filter is
    // empty" so the recruiter knows whether to clear the filter or source.
    const filtered = jobFilter !== "all";
    return (
      <div className="space-y-4">
        {jobs.length > 0 && (
          <JobFilter jobs={jobs} value={jobFilter} onChange={setJobFilter} t={t} />
        )}
        <div className="rounded-lg border bg-muted/30 p-10 text-center">
          <UserCheck className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold">
            {filtered
              ? t("crossJobPipeline.emptyFilteredTitle")
              : t("crossJobPipeline.emptyTitle")}
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            {filtered
              ? t("crossJobPipeline.emptyFilteredDesc")
              : t("crossJobPipeline.emptyDesc")}
          </p>
          {filtered && (
            <Button variant="outline" className="mt-4" onClick={() => setJobFilter("all")}>
              <X className="w-4 h-4 mr-1" />
              {t("crossJobPipeline.clearJobFilter")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <JobFilter jobs={jobs} value={jobFilter} onChange={setJobFilter} t={t} />
          <span className="text-sm text-muted-foreground">
            {t("labels.candidateCount", { count: snapshot.total })}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => exportCrossJobCsv(snapshot)}>
          <Download className="w-4 h-4 mr-1" />
          {t("actions.exportCsv")}
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-2 p-2 border rounded bg-muted/40">
          <span className="text-sm font-medium">
            {t("labels.selectedCount", { count: selected.size })}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              {t("actions.clear")}
            </Button>
            <Select onValueChange={(v) => handleBulkMove(v as PipelineStage)}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder={t("crossJobPipeline.bulkMovePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {PIPELINE_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`pipelineStage.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

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
    </div>
  );
}

function JobFilter({
  jobs,
  value,
  onChange,
  t,
}: {
  jobs: { id: string; title: string }[];
  value: string;
  onChange: (v: string) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[240px] h-9">
        <Briefcase className="w-4 h-4 mr-1" />
        <SelectValue placeholder={t("crossJobPipeline.allJobs")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("crossJobPipeline.allJobs")}</SelectItem>
        {jobs.map((j) => (
          <SelectItem key={j.id} value={j.id}>
            {j.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function exportCrossJobCsv(snapshot: CrossJobPipelineSnapshot): void {
  const header = ["job", "stage", "name", "email", "phone", "location", "tags", "stageChangedAt", "addedFrom"];
  const rows = snapshot.stages.flatMap((g) =>
    g.entries.map((e) => [
      e.jobTitle ?? "",
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
  const filename = `cross-job-pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
  downloadCsv(filename, buildCsv(header, rows));
}
