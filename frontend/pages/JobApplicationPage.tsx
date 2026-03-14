import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, ArrowLeft, Briefcase, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { jobService } from "@/lib/services/job-service";
import { resumeService } from "@/lib/services/resume-service";

interface Resume {
  id: string;
  name: string;
  isMaster?: boolean;
}

export default function JobApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  
  const [job, setJob] = useState<any>(null);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [coverLetter, setCoverLetter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error("Please sign in to apply for jobs");
      navigate("/login", { state: { from: `/jobs/${id}/apply` } });
      return;
    }

    loadData();
  }, [id, isAuthenticated, navigate]);

  const loadData = async () => {
    if (!id) return;

    try {
      setIsLoading(true);

      // Load job details
      const jobData = await jobService.getJobById(id);
      setJob(jobData);

      // Load user's resumes
      const resumesData = await resumeService.getUserResumes();

      // Map to our Resume interface (handle both PascalCase and camelCase)
      const mappedResumes: Resume[] = resumesData.map((r: any) => ({
        id: r.id || r.Id || "",
        name: r.name || r.Name || r.title || "Untitled Resume",
        isMaster: r.isMaster || r.IsMaster || false,
      }));

      setResumes(mappedResumes);

      // Auto-select master resume if available
      const masterResume = mappedResumes.find((r) => r.isMaster);
      if (masterResume) {
        setSelectedResumeId(masterResume.id);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Failed to load job details");
      navigate("/jobs");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedResumeId) {
      toast.error("Please select a resume");
      return;
    }

    if (!id) return;

    setIsSubmitting(true);

    try {
      await jobService.applyToJob(id, {
        resumeId: selectedResumeId,
        coverLetter: coverLetter.trim() || undefined,
      });

      toast.success("Application submitted successfully!");
      navigate(`/jobs/${id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to submit application";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Job not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => navigate(`/jobs/${id}`)}
        className="mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Job
      </Button>

      {/* Job Summary */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2 mb-2">
                <Briefcase className="h-5 w-5" />
                {job.Title || job.title}
              </CardTitle>
              {job.Company?.Name && (
                <CardDescription className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {job.Company.Name}
                </CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Application Form */}
      <Card>
        <CardHeader>
          <CardTitle>Submit Your Application</CardTitle>
          <CardDescription>
            Complete the form below to apply for this position
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Resume Selection */}
            <div className="space-y-2">
              <Label htmlFor="resume">Select Resume *</Label>
              {resumes.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  <p>You don't have any resumes yet.</p>
                  <Button
                    type="button"
                    variant="link"
                    className="p-0 h-auto"
                    onClick={() => navigate("/resumes/create")}
                  >
                    Create a resume first
                  </Button>
                </div>
              ) : (
                <Select
                  value={selectedResumeId}
                  onValueChange={setSelectedResumeId}
                  required
                >
                  <SelectTrigger id="resume">
                    <SelectValue placeholder="Choose a resume" />
                  </SelectTrigger>
                  <SelectContent>
                    {resumes.map((resume) => (
                      <SelectItem key={resume.id} value={resume.id}>
                        {resume.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Cover Letter */}
            <div className="space-y-2">
              <Label htmlFor="coverLetter">Cover Letter (Optional)</Label>
              <Textarea
                id="coverLetter"
                placeholder="Introduce yourself and explain why you're a great fit for this role..."
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                rows={8}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                A well-written cover letter can help you stand out from other candidates
              </p>
            </div>

            {/* Applicant Info */}
            {user && (
              <div className="rounded-lg border p-4 bg-muted/50">
                <h4 className="text-sm font-medium mb-2">Your Information</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p><strong>Name:</strong> {user.firstName} {user.lastName}</p>
                  <p><strong>Email:</strong> {user.email}</p>
                </div>
              </div>
            )}

            {/* Submit Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/jobs/${id}`)}
                disabled={isSubmitting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !selectedResumeId || resumes.length === 0}
                className="flex-1"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Submit Application
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Tips Card */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Application Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
            <li>Choose the resume that best matches this job's requirements</li>
            <li>Customize your cover letter for this specific position</li>
            <li>Highlight relevant skills and experiences</li>
            <li>Proofread your application before submitting</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

