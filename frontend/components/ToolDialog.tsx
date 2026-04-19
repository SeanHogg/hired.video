// Entity-agnostic quick-run dialog. Opened from any entity's context menu
// with a preselected "anchor" entity (the resume/job/video/etc. the user
// was acting on). Gathers any remaining inputs the tool needs, runs the
// tool, shows the result, and persists to the polymorphic tool_runs
// table with every entity reference it touched.

import { useEffect, useMemo, useState } from "react";
import { Crown, ExternalLink, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ResumeInputTabs, type ResumeInputValue } from "@/components/ResumeInputTabs";
import { ToolRunResultPanel } from "@/components/ToolRunResultPanel";
import { ToolTierBadge } from "@/components/ToolTierBadge";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { getTool } from "@/lib/tools/registry";
import { toolRunsService, type ToolRunEntityRefs } from "@/lib/services/tool-runs-service";
import type { NormalizedToolRunResult, ToolEntityType } from "@/lib/tools/types";
import { useQueryClient } from "@tanstack/react-query";

/** The entity the dialog is anchored to — i.e. the one whose context menu opened it. */
export interface ToolDialogAnchor {
  type: ToolEntityType;
  id: string;
  /** Display name shown in the dialog header. */
  name?: string;
  /** When the anchor is a job, an optional pre-fetched description. */
  jobDescription?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolId: string | null;
  anchor?: ToolDialogAnchor;
}

function summariseResult(toolLabel: string, result: NormalizedToolRunResult): string {
  if (typeof result.overallScore === "number") {
    return `${toolLabel}: ${Math.round(result.overallScore)}${result.grade ? ` (${result.grade})` : ""}`;
  }
  if (result.summary) return `${toolLabel}: ${result.summary.slice(0, 120)}`;
  return toolLabel;
}

export function ToolDialog({ open, onOpenChange, toolId, anchor }: Props) {
  const tool = useMemo(() => (toolId ? getTool(toolId) : undefined), [toolId]);
  const queryClient = useQueryClient();
  const { isPremium } = useSubscription();

  const [resumeInput, setResumeInput] = useState<ResumeInputValue | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NormalizedToolRunResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setResumeInput(null);
    setJobDescription(anchor?.type === "job" ? (anchor.jobDescription ?? "") : "");
    setRunning(false);
    setError(null);
    setResult(null);
  }, [open, toolId, anchor?.type, anchor?.id]);

  if (!tool) return null;

  const Icon = tool.icon;

  // What still needs to be gathered? Anything in `tool.inputs` not satisfied
  // by the anchor entity.
  const needsResume = tool.inputs.includes("resume") && anchor?.type !== "resume";
  const needsJobDescription = tool.inputs.includes("job") && anchor?.type !== "job";

  // Entity refs that will be persisted with the tool run. Start with the
  // anchor, then fold in anything gathered in the dialog.
  const entityRefs: ToolRunEntityRefs = useMemo(() => {
    const refs: ToolRunEntityRefs = {};
    if (anchor) {
      if (anchor.type === "resume") refs.resumeId = anchor.id;
      if (anchor.type === "job") refs.jobId = anchor.id;
      if (anchor.type === "video") refs.videoId = anchor.id;
      if (anchor.type === "template") refs.templateId = anchor.id;
      if (anchor.type === "company") refs.companyId = anchor.id;
    }
    if (resumeInput?.resumeId) refs.resumeId = resumeInput.resumeId;
    return refs;
  }, [anchor, resumeInput]);

  const resolvedResumeText = anchor?.type === "resume"
    ? undefined // resume content is fetched by the runner using resumeId
    : resumeInput?.resumeText;

  const proGated = !!tool.requiresPro && !isPremium;
  const canRun =
    !proGated &&
    (!needsResume || !!resumeInput?.resumeText) &&
    (!needsJobDescription || jobDescription.trim().length > 0) &&
    !running;

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const normalized = await tool.run({
        resumeId: entityRefs.resumeId,
        resumeText: resolvedResumeText,
        jobId: entityRefs.jobId,
        jobDescription: jobDescription || undefined,
        videoId: entityRefs.videoId,
        templateId: entityRefs.templateId,
        companyId: entityRefs.companyId,
      });
      setResult(normalized);

      // Only persist when we have at least one entity anchor (so the run
      // shows up somewhere in history). Paste-only runs from anonymous
      // context aren't attached to anything and stay ephemeral.
      if (Object.keys(entityRefs).length > 0) {
        try {
          await toolRunsService.create({
            ...entityRefs,
            toolId: tool.id,
            score: typeof normalized.overallScore === "number" ? normalized.overallScore : null,
            result: (normalized as unknown) as Record<string, unknown>,
            summary: summariseResult(tool.label, normalized),
            jobDescription: jobDescription || null,
          });
          // Invalidate the history panels for every entity this run touches.
          for (const [key, value] of Object.entries(entityRefs)) {
            if (!value) continue;
            const entityType = key.replace(/Id$/, "") as ToolEntityType;
            queryClient.invalidateQueries({ queryKey: ["tool-runs", entityType, value] });
          }
        } catch (persistErr) {
          // eslint-disable-next-line no-console
          console.warn("Failed to persist tool run", persistErr);
        }
      }
    } catch (err: any) {
      setError(err?.message ?? "The tool failed to run. Please try again.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tool.accentClassName ?? "bg-brand-purple/10 text-brand-purple"}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="flex items-center gap-2">
                {tool.label}
                <ToolTierBadge toolId={tool.id} />
              </DialogTitle>
              <DialogDescription className="line-clamp-2">
                {anchor?.name ? <>Running on <strong>{anchor.name}</strong>. {tool.description}</> : tool.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {needsResume && (
            <ResumeInputTabs
              value={resumeInput}
              onChange={setResumeInput}
              onError={setError}
            />
          )}

          {needsJobDescription && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Job Description</label>
              <Textarea
                placeholder="Paste the job description this tool should use..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                className="min-h-[120px]"
              />
            </div>
          )}

          {proGated && (
            <Alert className="bg-amber-50 border-amber-200">
              <AlertDescription className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-amber-900">
                  <Crown className="h-4 w-4" />
                  <strong>{tool.label}</strong> is a PRO feature.
                </span>
                <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700">
                  <Link to="/pricing" onClick={() => onOpenChange(false)}>Upgrade</Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between gap-2">
            <Button asChild variant="ghost" size="sm" className="gap-2">
              <Link to={tool.route} onClick={() => onOpenChange(false)}>
                <ExternalLink className="h-4 w-4" /> Open full tool
              </Link>
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button onClick={handleRun} disabled={!canRun}>
                {running ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running…</>
                ) : (
                  <>Run {tool.label}</>
                )}
              </Button>
            </div>
          </div>

          {result && (
            <div className="pt-2 border-t">
              <ToolRunResultPanel result={result} toolLabel={tool.label} />
            </div>
          )}
        </div>

        <DialogFooter className="sr-only">
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
