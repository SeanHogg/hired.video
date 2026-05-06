// AddCandidateToJobDialog — bridge between the candidate-resume pool
// (`candidate_resumes`) and a job's pipeline (`jobPipelineEntries`).
//
// A recruiter / employer browsing their pool at `/resumes?tab=sourced`
// picks a candidate, opens this dialog, selects one of their company's
// jobs, picks a starting stage, and a row is inserted into
// jobPipelineEntries. The candidate row in the pool is unchanged — pool
// and pipeline are separate concepts (see gap #406 in README).

import { useEffect, useMemo, useState } from "react";
import { Briefcase } from "lucide-react";
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
import { jobService, type JobSummary } from "@/lib/services/job-service";
import {
  jobPipelineService,
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  TERMINAL_STAGES,
  type PipelineStage,
} from "@/lib/services/job-pipeline-service";

interface AddCandidateToJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Candidate basics extracted from the pool row. The pipeline endpoint
   *  takes the same shape regardless of whether the candidate later signs
   *  up — `candidateUserId` stays null until they link an account. */
  candidate: {
    name: string;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    linkedinUrl?: string | null;
    resumeUrl?: string | null;
    avatarUrl?: string | null;
    candidateUserId?: string | null;
  } | null;
}

/** Stages a candidate is allowed to enter the pipeline at. Hired/rejected
 *  are terminal — adding someone there from the pool would be nonsense. */
const ENTRY_STAGES: PipelineStage[] = PIPELINE_STAGES.filter(
  (s) => !TERMINAL_STAGES.has(s),
);

export default function AddCandidateToJobDialog({
  open,
  onOpenChange,
  candidate,
}: AddCandidateToJobDialogProps): JSX.Element {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobId, setJobId] = useState<string>("");
  const [stage, setStage] = useState<PipelineStage>("longlist");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setJobsLoading(true);
    jobService
      .getUserJobs()
      .then((list) => {
        if (cancelled) return;
        setJobs(list);
        if (list.length > 0 && !jobId) setJobId(list[0]?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) setJobs([]);
      })
      .finally(() => {
        if (!cancelled) setJobsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submitDisabled = useMemo(
    () => !candidate || !jobId || submitting,
    [candidate, jobId, submitting],
  );

  const handleSubmit = async () => {
    if (!candidate || !jobId) return;
    setSubmitting(true);
    try {
      await jobPipelineService.add(jobId, {
        candidateName: candidate.name || "Unnamed candidate",
        candidateEmail: candidate.email ?? undefined,
        candidatePhone: candidate.phone ?? undefined,
        candidateLocation: candidate.location ?? undefined,
        candidateLinkedinUrl: candidate.linkedinUrl ?? undefined,
        candidateResumeUrl: candidate.resumeUrl ?? undefined,
        candidateAvatarUrl: candidate.avatarUrl ?? undefined,
        candidateUserId: candidate.candidateUserId ?? undefined,
        stage,
      });
      toast({
        title: "Added to pipeline",
        description: `${candidate.name || "Candidate"} entered ${PIPELINE_STAGE_LABELS[stage]} on the selected job.`,
      });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Failed to add to pipeline",
        description: (e as Error)?.message ?? "Try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            Add to job pipeline
          </DialogTitle>
          <DialogDescription>
            {candidate
              ? `Add ${candidate.name || "this candidate"} to one of your job pipelines. They stay in the candidate pool either way.`
              : "Pick a candidate first."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Job
            </label>
            <Select value={jobId} onValueChange={setJobId} disabled={jobsLoading || jobs.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={jobsLoading ? "Loading jobs…" : "Select a job"} />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!jobsLoading && jobs.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                You don't have any jobs yet. Post a job from /jobs first.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Starting stage
            </label>
            <Select value={stage} onValueChange={(v) => setStage(v as PipelineStage)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTRY_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {PIPELINE_STAGE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitDisabled}>
            {submitting ? "Adding…" : "Add to pipeline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
