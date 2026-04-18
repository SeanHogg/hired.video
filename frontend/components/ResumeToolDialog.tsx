// In-place "Run a tool on this resume" dialog — opened from the Resumes
// context menu. Skips re-entering the resume, runs the tool against the
// selected resume, shows the result panel inline, and persists the run to
// the tool_runs table so it shows up in the resume's history.

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
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
import { getResumeTool } from "@/lib/resume-tools/registry";
import { resumeToolRunsService } from "@/lib/services/resume-tool-runs-service";
import type { NormalizedToolRunResult } from "@/lib/resume-tools/types";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolId: string | null;
  /** Resume the tool should run against. When set, the "My Resumes" tab is used and pre-filled. */
  resumeId?: string;
  resumeName?: string;
}

function summariseResult(toolLabel: string, result: NormalizedToolRunResult): string {
  if (typeof result.overallScore === "number") {
    return `${toolLabel}: ${Math.round(result.overallScore)}${result.grade ? ` (${result.grade})` : ""}`;
  }
  if (result.summary) return `${toolLabel}: ${result.summary.slice(0, 120)}`;
  return toolLabel;
}

export function ResumeToolDialog({ open, onOpenChange, toolId, resumeId, resumeName }: Props) {
  const tool = useMemo(() => (toolId ? getResumeTool(toolId) : undefined), [toolId]);
  const queryClient = useQueryClient();

  const [input, setInput] = useState<ResumeInputValue | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NormalizedToolRunResult | null>(null);

  // Reset transient state when the dialog opens (or the tool changes) so a
  // previous run doesn't leak into a new one.
  useEffect(() => {
    if (open) {
      setInput(null);
      setJobDescription("");
      setRunning(false);
      setError(null);
      setResult(null);
    }
  }, [open, toolId, resumeId]);

  if (!tool) return null;

  const Icon = tool.icon;
  const canRun = !!input?.resumeText && (!tool.needsJobDescription || jobDescription.trim().length > 0) && !running;

  const handleRun = async () => {
    if (!input) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const normalized = await tool.run({
        resumeId: input.resumeId ?? "",
        resumeText: input.resumeText,
        jobDescription: jobDescription || undefined,
      });
      setResult(normalized);

      // Only persist runs that are tied to one of the user's own resumes —
      // paste/upload runs from anonymous context aren't part of any resume's
      // history. The dialog is typically opened from a resume so this path
      // is the common one.
      const resolvedResumeId = resumeId ?? input.resumeId;
      if (resolvedResumeId) {
        try {
          await resumeToolRunsService.create({
            resumeId: resolvedResumeId,
            toolId: tool.id,
            score: typeof normalized.overallScore === "number" ? normalized.overallScore : null,
            result: (normalized as unknown) as Record<string, unknown>,
            jobDescription: jobDescription || null,
            summary: summariseResult(tool.label, normalized),
          });
          queryClient.invalidateQueries({ queryKey: ["resume-tool-runs", resolvedResumeId] });
        } catch (persistErr) {
          // Persistence failure shouldn't break the user-visible result.
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
              <DialogTitle>{tool.label}</DialogTitle>
              <DialogDescription className="line-clamp-2">
                {resumeName ? <>Running on <strong>{resumeName}</strong>. {tool.description}</> : tool.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <ResumeInputTabs
            value={input}
            onChange={setInput}
            onError={setError}
            defaultTab={resumeId ? "existing" : undefined}
            initialResumeId={resumeId}
          />

          {tool.needsJobDescription && (
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
