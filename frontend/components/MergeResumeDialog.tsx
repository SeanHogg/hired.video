import React, { useState, useCallback, useMemo } from "react";
import { Loader2, GitMerge } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import type {
  MergeAnalysis,
  MergeDecision,
  MergeResult,
  MergeSectionType,
} from "@/types/resume";
import type { ResumeWithOwnership } from "@/lib/services/resume-service";
import { resumeService } from "@/lib/services/resume-service";
import MergeSourceSelector from "./merge/MergeSourceSelector";
import MergeAnalysisView from "./merge/MergeAnalysisView";

type Step = "select" | "analyze" | "review" | "execute";

interface MergeResumeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  resumes: ResumeWithOwnership[];
  preselectedTargetId?: string | null;
  onMergeComplete: () => void;
}

export default function MergeResumeDialog({
  isOpen,
  onClose,
  resumes,
  preselectedTargetId,
  onMergeComplete,
}: MergeResumeDialogProps) {
  const { toast } = useToast();

  // Step state
  const [step, setStep] = useState<Step>("select");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(preselectedTargetId ?? null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);

  // Analysis state
  const [analysis, setAnalysis] = useState<MergeAnalysis | null>(null);
  const [sourceContent, setSourceContent] = useState<Record<string, any> | null>(null);
  const [targetContent, setTargetContent] = useState<Record<string, any> | null>(null);

  // Decision state
  const [decisions, setDecisions] = useState<MergeDecision[]>([]);
  const [newItemDecisions, setNewItemDecisions] = useState<Map<string, boolean>>(new Map());
  const [basicDecisions, setBasicDecisions] = useState<Record<string, "source" | "target">>({});

  // Execute options
  const [createNew, setCreateNew] = useState(true);
  const [newTitle, setNewTitle] = useState("");

  // Reset when dialog closes
  const handleClose = useCallback(() => {
    setStep("select");
    setLoading(false);
    setError(null);
    setSourceId(null);
    setTargetId(preselectedTargetId ?? null);
    setSourceFile(null);
    setAnalysis(null);
    setSourceContent(null);
    setTargetContent(null);
    setDecisions([]);
    setNewItemDecisions(new Map());
    setBasicDecisions({});
    setCreateNew(true);
    setNewTitle("");
    onClose();
  }, [onClose, preselectedTargetId]);

  // Build decisions from analysis
  const buildDecisions = useCallback((a: MergeAnalysis): MergeDecision[] => {
    return a.sectionMatches.map((m) => ({
      sectionType: m.sectionType,
      sourceIndex: m.sourceIndex,
      targetIndex: m.targetIndex,
      action: m.mergeAction === "auto" ? "merge" : m.mergeAction === "manual" ? "merge" : "skip",
      mergeHighlights: "combine" as const,
    }));
  }, []);

  const buildNewItemDecisions = useCallback((a: MergeAnalysis): Map<string, boolean> => {
    const map = new Map<string, boolean>();
    for (const item of a.newSections) {
      map.set(`${item.sectionType}:${item.sourceIndex}`, true);
    }
    return map;
  }, []);

  // Analyze
  const handleAnalyze = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    setError(null);

    try {
      if (sourceFile) {
        // File-based merge
        const result = await resumeService.analyzeFileMerge(sourceFile, targetId);
        setAnalysis(result.analysis);
        setSourceContent(result.parsedContent as Record<string, any>);
        // Load target content from the resume list
        const targetResume = resumes.find((r) => r.id === targetId);
        setTargetContent((targetResume as any)?.metaResume ?? {});
        setDecisions(buildDecisions(result.analysis));
        setNewItemDecisions(buildNewItemDecisions(result.analysis));
        setNewTitle(`${targetResume?.name || "Resume"} (merged from file)`);
      } else if (sourceId) {
        // Resume-to-resume merge
        const result = await resumeService.analyzeMerge(sourceId, targetId);
        setAnalysis(result);
        // We need to get content from the resumes — the analysis works on the backend
        // For the review UI, load both resumes' metaResume data
        const sourceResume = resumes.find((r) => r.id === sourceId);
        const targetResume = resumes.find((r) => r.id === targetId);
        setSourceContent((sourceResume as any)?.metaResume ?? {});
        setTargetContent((targetResume as any)?.metaResume ?? {});
        setDecisions(buildDecisions(result));
        setNewItemDecisions(buildNewItemDecisions(result));
        setNewTitle(`${targetResume?.name || "Resume"} (merged)`);
      }
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [targetId, sourceId, sourceFile, resumes, buildDecisions, buildNewItemDecisions]);

  // Execute merge
  const handleExecute = useCallback(async () => {
    if (!targetId || !analysis) return;
    setLoading(true);
    setError(null);

    try {
      // Build final decisions including new items as "add" decisions
      const allDecisions: MergeDecision[] = [...decisions];
      for (const [key, included] of newItemDecisions) {
        if (!included) continue;
        const [sectionType, sourceIndexStr] = key.split(":");
        allDecisions.push({
          sectionType,
          sourceIndex: parseInt(sourceIndexStr),
          targetIndex: null,
          action: "add",
        });
      }

      if (!sourceId && !sourceContent) {
        toast({
          title: "Error",
          description: "No source resume or parsed content available for merging.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const result: MergeResult = await resumeService.executeMerge({
        // For file-based merges (no sourceId), send the parsed content inline
        ...(sourceId ? { sourceResumeId: sourceId } : { sourceContent: sourceContent ?? {} }),
        targetResumeId: targetId,
        decisions: allDecisions,
        basicDecisions,
        createNew,
        newTitle: createNew ? newTitle : undefined,
      });

      toast({
        title: "Merge complete",
        description: `Merged ${result.mergedSections} sections, added ${result.newSections} new items.`,
      });

      onMergeComplete();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setLoading(false);
    }
  }, [targetId, sourceId, analysis, decisions, newItemDecisions, basicDecisions, createNew, newTitle, toast, onMergeComplete, handleClose]);

  const handleDecisionChange = useCallback((index: number, decision: MergeDecision) => {
    setDecisions((prev) => {
      const next = [...prev];
      next[index] = decision;
      return next;
    });
  }, []);

  const handleNewItemToggle = useCallback((key: string) => {
    setNewItemDecisions((prev) => {
      const next = new Map(prev);
      next.set(key, !next.get(key));
      return next;
    });
  }, []);

  const handleBasicDecisionChange = useCallback((field: string, choice: "source" | "target") => {
    setBasicDecisions((prev) => ({ ...prev, [field]: choice }));
  }, []);

  const canAnalyze = targetId && (sourceId || sourceFile);
  const canExecute = analysis && (sourceId || sourceFile);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Resume Merge
          </DialogTitle>
          <DialogDescription>
            {step === "select" && "Select a source and target resume to merge"}
            {step === "review" && "Review matched sections and choose merge actions"}
            {step === "execute" && "Configure merge output"}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md p-3">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto pr-1">
          {/* Step 1: Select */}
          {step === "select" && (
            <MergeSourceSelector
              resumes={resumes}
              targetResumeId={targetId}
              selectedSourceId={sourceId}
              onSelectSource={(id) => {
                setSourceId(id);
                setSourceFile(null);
              }}
              onSelectTarget={setTargetId}
              onFileSelect={(file) => {
                setSourceFile(file);
                setSourceId(null);
              }}
            />
          )}

          {/* Step 2: Review */}
          {step === "review" && analysis && sourceContent && targetContent && (
            <div className="space-y-4">
              <MergeAnalysisView
                analysis={analysis}
                sourceContent={sourceContent}
                targetContent={targetContent}
                decisions={decisions}
                onDecisionChange={handleDecisionChange}
                newItemDecisions={newItemDecisions}
                onNewItemToggle={handleNewItemToggle}
                basicDecisions={basicDecisions}
                onBasicDecisionChange={handleBasicDecisionChange}
              />

              {/* Execution options */}
              <div className="border rounded-md p-3 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label htmlFor="create-new" className="text-sm">
                    Create new resume (instead of updating target)
                  </Label>
                  <Switch
                    id="create-new"
                    checked={createNew}
                    onCheckedChange={setCreateNew}
                  />
                </div>
                {createNew && (
                  <div>
                    <Label htmlFor="new-title" className="text-xs text-muted-foreground">
                      New resume title
                    </Label>
                    <Input
                      id="new-title"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Merged Resume"
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                {step === "select" ? "Analyzing resumes..." : "Executing merge..."}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === "select" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleAnalyze} disabled={!canAnalyze || loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Analyze
              </Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="outline" onClick={() => setStep("select")}>
                Back
              </Button>
              <Button onClick={handleExecute} disabled={!canExecute || loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Execute Merge
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
