/**
 * Merge dialog on the résumé list ("Copy to master", vendor-sync imports):
 * pick a source + target, review the analysis (shared MergeAnalysisView),
 * apply in place or save as a version of the target's master.
 *
 * Decisions come from the shared useMergeDecisions (same defaults as the kit's
 * on-page merge); the server decides where a saved version goes
 * (lineage.ts). The kit workspace is the full review — this is the quick path.
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
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
import type { MergeAnalysis, MergeDecision, MergeResult } from "@/types/resume";
import type { ResumeWithOwnership } from "@/lib/services/resume-service";
import { resumeService } from "@/lib/services/resume-service";
import { useMergeDecisions } from "@/lib/merge/use-merge-decisions";
import MergeSourceSelector from "./merge/MergeSourceSelector";
import MergeAnalysisView from "./merge/MergeAnalysisView";

type Step = "select" | "review";

interface MergeResumeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  resumes: ResumeWithOwnership[];
  preselectedTargetId?: string | null;
  /** Pre-populate the source resume, e.g. when used for "Copy to Master"
   *  from a variant where both sides are already determined. */
  preselectedSourceId?: string | null;
  /** Pre-loaded import (Vendor Sync flow): skip select/analyze and open on
   *  review with the pre-computed analysis. */
  preloaded?: {
    analysis: MergeAnalysis;
    sourceContent: Record<string, any>;
    targetContent: Record<string, any>;
    /** Title to default the "save as a version" name to. */
    defaultNewTitle?: string;
  } | null;
  /** Override the default `/api/resumes/merge/execute` call (Vendor Sync
   *  finalises its audit row atomically with the merge). */
  customExecutor?: (args: {
    sourceContent: Record<string, any>;
    targetResumeId: string;
    decisions: MergeDecision[];
    basicDecisions: Record<string, "source" | "target">;
    createNew: boolean;
    newTitle?: string;
  }) => Promise<MergeResult>;
  onMergeComplete: () => void;
}

export default function MergeResumeDialog({
  isOpen,
  onClose,
  resumes,
  preselectedTargetId,
  preselectedSourceId,
  preloaded,
  customExecutor,
  onMergeComplete,
}: MergeResumeDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(preloaded ? "review" : "select");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(preselectedSourceId ?? null);
  const [targetId, setTargetId] = useState<string | null>(preselectedTargetId ?? null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<MergeAnalysis | null>(preloaded?.analysis ?? null);
  const [sourceContent, setSourceContent] = useState<Record<string, any> | null>(preloaded?.sourceContent ?? null);
  const [targetContent, setTargetContent] = useState<Record<string, any> | null>(preloaded?.targetContent ?? null);
  const decisions = useMergeDecisions(analysis);

  // "Copy to master" (both sides preselected) and vendor imports update the
  // target in place by default; otherwise default to a new version.
  const bothPreselected = !!(preselectedSourceId && preselectedTargetId);
  const [createNew, setCreateNew] = useState(preloaded ? false : !bothPreselected);
  const [newTitle, setNewTitle] = useState(preloaded?.defaultNewTitle ?? "");

  const handleClose = useCallback(() => {
    setStep("select");
    setLoading(false);
    setError(null);
    setSourceId(preselectedSourceId ?? null);
    setTargetId(preselectedTargetId ?? null);
    setSourceFile(null);
    setAnalysis(null);
    setSourceContent(null);
    setTargetContent(null);
    setCreateNew(!bothPreselected);
    setNewTitle("");
    onClose();
  }, [onClose, preselectedTargetId, preselectedSourceId, bothPreselected]);

  const handleAnalyze = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    setError(null);
    try {
      const targetTitle = resumes.find((r) => r.id === targetId)?.title || t("labels.untitledResume");
      if (sourceFile) {
        const result = await resumeService.analyzeFileMerge(sourceFile, targetId);
        setAnalysis(result.analysis);
        setSourceContent(result.parsedContent as Record<string, any>);
        setTargetContent(result.targetContent as Record<string, any>);
        setNewTitle(t("labels.mergedFromFileTitle", { name: targetTitle }));
      } else if (sourceId) {
        const result = await resumeService.analyzeMerge(sourceId, targetId);
        setAnalysis(result.analysis);
        setSourceContent(result.sourceContent as Record<string, any>);
        setTargetContent(result.targetContent as Record<string, any>);
        setNewTitle(t("labels.mergedTitle", { name: targetTitle }));
      }
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.analysisFailed"));
    } finally {
      setLoading(false);
    }
  }, [targetId, sourceId, sourceFile, resumes, t]);

  const handleExecute = useCallback(async () => {
    if (!targetId || !analysis) return;
    if (!sourceId && !sourceContent) {
      setError(t("merge.dialog.noSource"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const request = {
        targetResumeId: targetId,
        decisions: decisions.finalDecisions,
        basicDecisions: decisions.basics,
        createNew,
        newTitle: createNew ? newTitle : undefined,
      };
      const result: MergeResult = customExecutor
        ? await customExecutor({ sourceContent: (sourceContent ?? {}) as Record<string, any>, ...request })
        : await resumeService.executeMerge({
            ...(sourceId ? { sourceResumeId: sourceId } : { sourceContent: sourceContent ?? {} }),
            ...request,
          });
      toast({
        title: t("messages.mergeCompleteTitle"),
        description: t("messages.mergeCompleteDesc", { merged: result.mergedSections, added: result.newSections }),
      });
      onMergeComplete();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.mergeFailed"));
    } finally {
      setLoading(false);
    }
  }, [targetId, analysis, sourceId, sourceContent, decisions.finalDecisions, decisions.basics, createNew, newTitle, customExecutor, toast, t, onMergeComplete, handleClose]);

  const canAnalyze = !!targetId && !!(sourceId || sourceFile);
  const canExecute = !!analysis && !!(sourceId || sourceContent);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" aria-hidden="true" />
            {t("merge.dialog.title")}
          </DialogTitle>
          <DialogDescription>{t(step === "select" ? "merge.dialog.selectHint" : "merge.dialog.reviewHint")}</DialogDescription>
        </DialogHeader>

        {error && (
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto pr-1">
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

          {step === "review" && analysis && sourceContent && targetContent && (
            <div className="space-y-4">
              <MergeAnalysisView
                analysis={analysis}
                sourceContent={sourceContent}
                targetContent={targetContent}
                decisions={decisions.decisions}
                onDecisionChange={decisions.setDecision}
                newItemDecisions={decisions.newItems}
                onNewItemToggle={decisions.toggleNewItem}
                basicDecisions={decisions.basics}
                onBasicDecisionChange={decisions.setBasic}
              />
              <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="create-new" className="text-sm">
                    {t("review.merge.saveAsVersion")}
                  </Label>
                  <Switch id="create-new" checked={createNew} onCheckedChange={setCreateNew} />
                </div>
                {createNew && (
                  <div>
                    <Label htmlFor="new-title" className="text-xs text-muted-foreground">
                      {t("review.merge.versionTitle")}
                    </Label>
                    <Input id="new-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="mt-1" />
                  </div>
                )}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-12" aria-live="polite">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="ml-2 text-sm text-muted-foreground">
                {t(step === "select" ? "status.analyzing" : "merge.dialog.applying")}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === "select" ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                {t("actions.cancel")}
              </Button>
              <Button onClick={handleAnalyze} disabled={!canAnalyze || loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {t("merge.dialog.analyze")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("select")}>
                {t("actions.back")}
              </Button>
              <Button onClick={handleExecute} disabled={!canExecute || loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {t("merge.dialog.apply")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
