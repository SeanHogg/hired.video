// BulkScoreDialog — pick a job, score the selected candidate resumes,
// show a ranked table of skill-overlap scores. Heuristic v1; LLM-driven
// scoring is the existing /api/recruiter/match/score-candidates queue path.
//
// Closes audit gap #5 (no bulk resume scoring previously existed).

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api-client";
import { jobService, type JobSummary } from "@/lib/services/job-service";

interface BulkScoreResult {
  resumeId: string;
  candidateName: string;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  titleMatch: boolean;
}

interface BulkScoreResponse {
  jobId: string;
  jobTitle: string;
  jobSkillCount: number;
  results: BulkScoreResult[];
  scored: number;
}

interface BulkScoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeIds: string[];
}

export default function BulkScoreDialog({ open, onOpenChange, resumeIds }: BulkScoreDialogProps) {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [jobId, setJobId] = useState<string>("");
  const [scoring, setScoring] = useState(false);
  const [response, setResponse] = useState<BulkScoreResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    setResponse(null);
    let cancelled = false;
    // Public browse is the simplest source; recruiter scoring against any
    // job (their own or otherwise) is fine for v1.
    jobService
      .getPublicJobs({ page: 1, limit: 50 })
      .then((res) => {
        if (cancelled) return;
        setJobs(res.items);
        if (res.items.length > 0) setJobId(res.items[0].id);
      })
      .catch(() => {
        // Leave list empty — user sees "no jobs available".
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleScore = async () => {
    if (!jobId) return;
    setScoring(true);
    try {
      const res = await apiClient.post<BulkScoreResponse>("/api/recruiter/bulk-score/score", {
        resumeIds,
        jobId,
      });
      setResponse(res.data);
    } catch (e) {
      toast({
        title: "Scoring failed",
        description: (e as Error)?.message ?? "Try again.",
        variant: "destructive",
      });
    } finally {
      setScoring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Bulk score {resumeIds.length} candidate{resumeIds.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Heuristic match against the selected job — skill overlap, title keyword match,
            description keyword overlap. Ranked highest-first.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">Score against job</label>
            <Select value={jobId} onValueChange={setJobId} disabled={jobs.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={jobs.length === 0 ? "No jobs available" : "Pick a job"} />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {response && (
            <div className="border rounded p-3 bg-muted/30 space-y-2">
              <div className="text-xs text-muted-foreground">
                Scored against <strong>{response.jobTitle}</strong> ·{" "}
                {response.jobSkillCount} required skills · {response.scored} candidates
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-1.5 px-2">#</th>
                      <th className="text-left py-1.5 px-2">Candidate</th>
                      <th className="text-right py-1.5 px-2">Score</th>
                      <th className="text-left py-1.5 px-2">Matched / Missing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {response.results.map((r, idx) => (
                      <tr key={r.resumeId} className="border-b last:border-b-0">
                        <td className="py-1.5 px-2 text-muted-foreground">{idx + 1}</td>
                        <td className="py-1.5 px-2 font-medium">
                          {r.candidateName}
                          {r.titleMatch && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              title match
                            </Badge>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <span
                            className={
                              r.score >= 70
                                ? "font-bold text-green-700"
                                : r.score >= 40
                                  ? "font-semibold text-amber-700"
                                  : "text-muted-foreground"
                            }
                          >
                            {r.score}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-xs">
                          <div className="text-green-700 truncate" title={r.matchedSkills.join(", ")}>
                            +{r.matchedSkills.length}
                            {r.matchedSkills.length > 0 && `: ${r.matchedSkills.slice(0, 3).join(", ")}`}
                          </div>
                          <div className="text-red-700 truncate" title={r.missingSkills.join(", ")}>
                            −{r.missingSkills.length}
                            {r.missingSkills.length > 0 && `: ${r.missingSkills.slice(0, 3).join(", ")}`}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleScore} disabled={scoring || !jobId}>
            {scoring ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Scoring…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-1" />
                {response ? "Re-score" : "Score"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
