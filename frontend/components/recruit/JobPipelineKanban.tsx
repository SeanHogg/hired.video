// JobPipelineKanban — full pipeline surface for one job. Self-contained
// data fetching; renders one collapsible swimlane per stage with the
// per-card actions and a bulk-action toolbar above the columns.
//
// Phase 1 ships click-to-move via a per-card dropdown. Drag-and-drop, the
// inline email/SMS composer, "Find Contact" enrichment, branded reports,
// and the live hiring-manager portal are tracked as Phase 2.

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FolderPlus,
  Loader2,
  Plus,
  Send,
  Share,
  UserCheck,
  X,
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
import { useToast } from "@/hooks/use-toast";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  jobPipelineService,
  type PipelineEntry,
  type PipelineSnapshot,
  type PipelineStage,
  type AddPipelineEntryInput,
} from "@/lib/services/job-pipeline-service";
import JobPipelineCard from "@/components/recruit/JobPipelineCard";
import AddPipelineCandidateDialog from "@/components/recruit/AddPipelineCandidateDialog";

interface JobPipelineKanbanProps {
  jobId: string;
  /** Lift the total entry count up to the parent (so the tab badge matches). */
  onCountChange?: (total: number) => void;
}

export default function JobPipelineKanban({ jobId, onCountChange }: JobPipelineKanbanProps) {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<PipelineStage>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);

  const refresh = async () => {
    try {
      const next = await jobPipelineService.list(jobId);
      setSnapshot(next);
      onCountChange?.(next.total);
    } catch {
      toast({
        title: "Failed to load pipeline",
        description: "Refresh the page or check your connection.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const next = await jobPipelineService.list(jobId);
        if (cancelled) return;
        setSnapshot(next);
        onCountChange?.(next.total);
      } catch {
        if (!cancelled) {
          toast({
            title: "Failed to load pipeline",
            description: "Refresh the page or check your connection.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, onCountChange, toast]);

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

  const clearSelection = () => setSelected(new Set());

  const handleMoveStage = async (entryId: string, stage: PipelineStage) => {
    // Optimistic move so the card jumps columns instantly.
    setSnapshot((prev) => prev && optimisticMove(prev, entryId, stage));
    try {
      await jobPipelineService.moveStage(jobId, entryId, stage);
      toast({ title: "Moved", description: `Now in ${PIPELINE_STAGE_LABELS[stage]}.` });
    } catch (e) {
      toast({
        title: "Move failed",
        description: (e as Error)?.message ?? "Reverting.",
        variant: "destructive",
      });
      refresh();
    }
  };

  const handleBulkMove = async (stage: PipelineStage) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setSnapshot((prev) => {
      if (!prev) return prev;
      let next = prev;
      for (const id of ids) next = optimisticMove(next, id, stage);
      return next;
    });
    clearSelection();
    try {
      await Promise.all(ids.map((id) => jobPipelineService.moveStage(jobId, id, stage)));
      toast({ title: "Bulk move complete", description: `${ids.length} candidate(s) → ${PIPELINE_STAGE_LABELS[stage]}.` });
    } catch (e) {
      toast({
        title: "Bulk move failed",
        description: (e as Error)?.message ?? "Reverting.",
        variant: "destructive",
      });
      refresh();
    }
  };

  const handleBulkReject = async () => {
    await handleBulkMove("rejected");
  };

  const handleBulkSubmit = async () => {
    await handleBulkMove("submitted");
  };

  const handleRemove = async (entryId: string) => {
    setSnapshot((prev) => prev && removeFromSnapshot(prev, entryId));
    try {
      await jobPipelineService.remove(jobId, entryId);
      toast({ title: "Removed", description: "Candidate dropped from this pipeline." });
    } catch (e) {
      toast({
        title: "Remove failed",
        description: (e as Error)?.message ?? "Reverting.",
        variant: "destructive",
      });
      refresh();
    }
  };

  const handleAdd = async (input: AddPipelineEntryInput) => {
    try {
      const entry = await jobPipelineService.add(jobId, input);
      setSnapshot((prev) => prev && insertIntoSnapshot(prev, entry));
      onCountChange?.((snapshot?.total ?? 0) + 1);
      toast({ title: "Candidate added", description: `${entry.candidateName} → ${PIPELINE_STAGE_LABELS[entry.stage]}.` });
    } catch (e) {
      toast({
        title: "Add failed",
        description: (e as Error)?.message ?? "Try again.",
        variant: "destructive",
      });
      throw e;
    }
  };

  const visibleStages = useMemo(
    () => snapshot?.stages.filter((g) => g.stage !== "rejected" || g.count > 0) ?? [],
    [snapshot],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading pipeline…
      </div>
    );
  }

  if (!snapshot || snapshot.total === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-10 text-center">
        <UserCheck className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-semibold">No candidates in this pipeline yet</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          Source candidates manually with Add People, or wait for inbound applications.
          Every touchpoint is logged automatically once they're in the funnel.
        </p>
        <div className="flex justify-center gap-2 mt-4">
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Add People
          </Button>
        </div>
        <AddPipelineCandidateDialog open={addOpen} onOpenChange={setAddOpen} onAdd={handleAdd} />
      </div>
    );
  }

  const selectionCount = selected.size;

  return (
    <div className="space-y-4">
      {/* Action toolbar — bulk on the left, share/portal/add on the right.
          Branded reports + live hiring-manager portal land in Phase 2 — the
          buttons placeholder-toast for now so the UX shape is visible. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border rounded-lg p-2 bg-muted/30">
        <div className="flex flex-wrap items-center gap-1">
          {selectionCount > 0 && (
            <span className="text-xs font-medium text-muted-foreground mr-2">
              {selectionCount} selected
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={selectionCount === 0}>
                <Send className="w-3.5 h-3.5 mr-1" />
                Move Stage
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuLabel>Move {selectionCount} to</DropdownMenuLabel>
              {PIPELINE_STAGES.filter((s) => s !== "rejected").map((s) => (
                <DropdownMenuItem key={s} onClick={() => handleBulkMove(s)}>
                  {PIPELINE_STAGE_LABELS[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={handleBulkReject} disabled={selectionCount === 0}>
            <X className="w-3.5 h-3.5 mr-1" />
            Reject
          </Button>
          <Button variant="outline" size="sm" onClick={handleBulkSubmit} disabled={selectionCount === 0}>
            <Send className="w-3.5 h-3.5 mr-1" />
            Submit Candidates
          </Button>
          {selectionCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast({ title: "Coming soon", description: "Add to talent pool / collection lands in Phase 2." })}
            disabled={selectionCount === 0}
          >
            <FolderPlus className="w-3.5 h-3.5 mr-1" />
            Add to…
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast({ title: "Coming soon", description: "CSV export lands in Phase 2." })}
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast({ title: "Coming soon", description: "Branded status reports + hiring-manager portal land in Phase 2." })}
          >
            <Share className="w-3.5 h-3.5 mr-1" />
            Share
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add People
          </Button>
        </div>
      </div>

      {/* Horizontal kanban — stages scroll on overflow on small screens.
          Collapsed columns shrink to a narrow sidebar with the count visible. */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {visibleStages.map((group) => {
          const isCollapsed = collapsed.has(group.stage);
          if (isCollapsed) {
            return (
              <button
                key={group.stage}
                type="button"
                onClick={() => toggleCollapsed(group.stage)}
                className="flex flex-col items-center gap-2 px-2 py-3 border rounded-lg bg-card hover:bg-muted/50 min-w-[44px] sticky"
                title={`Expand ${PIPELINE_STAGE_LABELS[group.stage]}`}
              >
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium [writing-mode:vertical-rl]">
                  {PIPELINE_STAGE_LABELS[group.stage]} ({group.count})
                </span>
              </button>
            );
          }
          return (
            <div key={group.stage} className="flex-shrink-0 w-[300px]">
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(group.stage)}
                  className="flex items-center gap-1 font-semibold text-sm hover:text-primary"
                >
                  <ChevronDown className="w-4 h-4" />
                  {PIPELINE_STAGE_LABELS[group.stage]}{" "}
                  <span className="text-muted-foreground">({group.count})</span>
                </button>
              </div>
              <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                {group.entries.map((entry) => (
                  <JobPipelineCard
                    key={entry.id}
                    entry={entry}
                    selected={selected.has(entry.id)}
                    onToggleSelect={handleToggleSelect}
                    onMoveStage={handleMoveStage}
                    onRemove={handleRemove}
                  />
                ))}
                {group.entries.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded">
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AddPipelineCandidateDialog open={addOpen} onOpenChange={setAddOpen} onAdd={handleAdd} />
    </div>
  );
}

// ---- pure helpers (snapshot mutations) ------------------------------------

function optimisticMove(snap: PipelineSnapshot, entryId: string, target: PipelineStage): PipelineSnapshot {
  let moved: PipelineEntry | null = null;
  const stages = snap.stages.map((g) => {
    const idx = g.entries.findIndex((e) => e.id === entryId);
    if (idx === -1) return g;
    moved = { ...g.entries[idx], stage: target, stageChangedAt: new Date().toISOString() };
    const entries = [...g.entries.slice(0, idx), ...g.entries.slice(idx + 1)];
    return { ...g, entries, count: entries.length };
  });
  if (!moved) return snap;
  const next = stages.map((g) =>
    g.stage === target ? { ...g, entries: [moved as PipelineEntry, ...g.entries], count: g.entries.length + 1 } : g,
  );
  return { ...snap, stages: next };
}

function removeFromSnapshot(snap: PipelineSnapshot, entryId: string): PipelineSnapshot {
  let removed = false;
  const stages = snap.stages.map((g) => {
    const idx = g.entries.findIndex((e) => e.id === entryId);
    if (idx === -1) return g;
    removed = true;
    const entries = [...g.entries.slice(0, idx), ...g.entries.slice(idx + 1)];
    return { ...g, entries, count: entries.length };
  });
  return removed ? { ...snap, stages, total: snap.total - 1 } : snap;
}

function insertIntoSnapshot(snap: PipelineSnapshot, entry: PipelineEntry): PipelineSnapshot {
  const stages = snap.stages.map((g) =>
    g.stage === entry.stage ? { ...g, entries: [entry, ...g.entries], count: g.entries.length + 1 } : g,
  );
  return { ...snap, stages, total: snap.total + 1 };
}
