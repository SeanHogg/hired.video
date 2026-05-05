import { ArrowLeft, Briefcase } from "lucide-react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import JobEditForm from "@/components/JobEditForm";
import { AppShell } from "@/components/AppShell";
import PageHeader, { type PageHeaderTab } from "@/components/PageHeader";
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
      console.error("Failed to update job:", error);
      toast.error("Failed to update job. Please try again.");
      throw error; // Re-throw to let the form handle it
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate(job ? `/jobs/${job.id}` : "/jobs");
  };

  const tabs: PageHeaderTab[] = [
    { key: "jobs", label: "Jobs", icon: Briefcase, to: "/jobs" },
    ...(job ? [{ key: "job", label: job.title, to: `/jobs/${job.id}` } satisfies PageHeaderTab] : []),
    { key: "edit", label: "Edit" },
  ];

  return (
    <AppShell bgClassName="bg-background">
        <div className="max-w-4xl mx-auto p-4 md:p-6">
            <PageHeader
              tabs={tabs}
              activeTabKey="edit"
              title={job ? `Edit ${job.title}` : "Edit Job Posting"}
              description="Update your job posting details, requirements, and benefits"
              actions={
                <Button asChild variant="outline">
                  <Link to={job ? `/jobs/${job.id}` : "/jobs"}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {job ? "Back to Job" : "Back to Jobs"}
                  </Link>
                </Button>
              }
            />

            {loading ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Loading job details...
                  </p>
                </CardContent>
              </Card>
            ) : job && permissions.canEdit ? (
              <JobEditForm
                job={job}
                onSave={handleSave}
                onCancel={handleCancel}
                loading={saving}
              />
            ) : job && !permissions.canEdit ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
                  <p className="text-muted-foreground mb-6">
                    You don't have permission to edit this job. Only the job
                    creator, account owners, and recruiters within the same
                    company can edit jobs.
                  </p>
                  <div className="flex gap-4 justify-center">
                    <Button asChild variant="outline">
                      <Link to={`/jobs/${job.id}`}>View Job</Link>
                    </Button>
                    <Button asChild>
                      <Link to="/jobs">Back to Jobs</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Job Not Found</h3>
                  <p className="text-muted-foreground mb-6">
                    The job you're trying to edit could not be found or you
                    don't have permission to edit it.
                  </p>
                  <Button asChild>
                    <Link to="/jobs">Back to Jobs</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
        </div>
    </AppShell>
  );
}
