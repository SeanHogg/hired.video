/**
 * JobScreeningPage — owner-only home for a job's video-screening setup
 * (`/jobs/:id/screening`). Job content editing moved into the Studio document
 * canvas (#1914), but screening is a structured builder (#1918), not paged
 * document content, so it lives on its own route. Reachable from the job detail
 * page and the Studio job editor's "Screening" panel.
 */
import { Briefcase } from "lucide-react";
import { publicJobPath } from "@shared/public-paths";
import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import EntityEditShell from "@/components/EntityEditShell";
import { JobScreeningCard } from "@/components/jobs/JobScreeningCard";
import ScorecardVisibilityPanel from "@/components/scorecards/ScorecardVisibilityPanel";
import { jobService } from "@/lib/services/job-service";
import { useJobPermissions } from "@/hooks/use-job-permissions";
import { usePageChrome } from "@/lib/seo";
import { toast } from "sonner";

export default function JobScreeningPage() {
  const { id } = useParams<{ id: string }>();
  // SEO + breadcrumb JSON-LD (route-derived; owner-only page falls back to the
  // /jobs base entry). Satisfies the require-page-chrome contract.
  usePageChrome();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const permissions = useJobPermissions(job);

  useEffect(() => {
    const loadJob = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const jobData = await jobService.getJobById(id);
        setJob(jobData);
      } catch (error) {
        console.error("Failed to load job:", error);
        toast.error("Failed to load job details");
      } finally {
        setLoading(false);
      }
    };
    loadJob();
  }, [id]);

  return (
    <EntityEditShell
      hubEntity="job"
      parent={{ label: "Jobs", to: "/jobs", icon: Briefcase }}
      entity={{ label: job?.title, to: job ? publicJobPath(job.id) : undefined }}
      description="Attach a video screening interview candidates complete when they apply"
      loading={loading}
      accessDenied={!loading && !!job && !permissions.canEdit}
      accessDeniedMessage="You don't have permission to manage screening for this job. Only the job creator, account owners, and recruiters within the same company can edit it."
      notFound={!loading && !job}
    >
      {job && permissions.canEdit && (
        <div className="space-y-4">
          <JobScreeningCard jobId={job.id} jobTitle={job.title} />
          {/* #241 — per-job hiring-manager scorecard visibility override. */}
          <ScorecardVisibilityPanel scope="job" id={job.id} />
        </div>
      )}
    </EntityEditShell>
  );
}
