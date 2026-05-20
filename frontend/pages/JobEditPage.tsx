import { Briefcase } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import JobEditForm from "@/components/JobEditForm";
import EntityEditShell from "@/components/EntityEditShell";
import { jobService } from "@/lib/services/job-service";
import { useAuth } from "@/lib/auth";
import { useJobPermissions } from "@/hooks/use-job-permissions";
import { toast } from "sonner";

export default function JobEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();  const { user } = useAuth();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const handleSave = async (jobData: any) => {
    if (!id) return;

    setSaving(true);
    try {
      await jobService.updateJob(id, jobData);
      toast.success("Job updated successfully!");
      navigate(`/jobs/${id}`);
    } catch (error) {
      // Don't toast here — JobEditForm catches and either maps Zod
      // field errors to inline messages under each input or shows a
      // generic toast itself. A page-level toast on top of that would
      // double-up and hide which field actually broke (gap #876).
      console.error("Failed to update job:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate(job ? `/jobs/${job.id}` : "/jobs");
  };

  return (
    <EntityEditShell
      parent={{ label: "Jobs", to: "/jobs", icon: Briefcase }}
      entity={{ label: job?.title, to: job ? `/jobs/${job.id}` : undefined }}
      description="Update your job posting details, requirements, and benefits"
      loading={loading}
      accessDenied={!loading && !!job && !permissions.canEdit}
      accessDeniedMessage="You don't have permission to edit this job. Only the job creator, account owners, and recruiters within the same company can edit jobs."
      notFound={!loading && !job}
    >
      {job && permissions.canEdit && (
        <JobEditForm
          job={job}
          onSave={handleSave}
          onCancel={handleCancel}
          loading={saving}
        />
      )}
    </EntityEditShell>
  );
}
