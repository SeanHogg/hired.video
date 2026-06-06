import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Send, ArrowLeft, Briefcase, Building2, Video, Clock, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { jobService } from "@/lib/services/job-service";
import { resumeService } from "@/lib/services/resume-service";
import {
  getJobScreeningPreview,
  type JobScreeningPreview,
} from "@/lib/services/interview-question-sets-service";

interface Resume {
  id: string;
  title: string;
  isMaster?: boolean;
}

export default function JobApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { t } = useTranslation();

  const [job, setJob] = useState<any>(null);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [coverLetter, setCoverLetter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Screening config — populated when the job has a question set attached.
  const [screening, setScreening] = useState<JobScreeningPreview | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error(t("messages.signInToApply"));
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

      // Screening preview — sanitised (counts + timing only, no questions
      // leak). Used to warn the candidate that a screening interview will
      // follow once they submit. Best-effort; on error we just skip the panel.
      try {
        const screeningData = await getJobScreeningPreview(id);
        setScreening(screeningData);
      } catch {
        setScreening(null);
      }

      // Load user's resumes
      const resumesData = await resumeService.getUserResumes();

      const mappedResumes: Resume[] = resumesData.map((r: any) => ({
        id: r.id || "",
        title: r.title || t("labels.untitledResume"),
        isMaster: r.isMaster || false,
      }));

      setResumes(mappedResumes);

      // Auto-select master resume if available
      const masterResume = mappedResumes.find((r) => r.isMaster);
      if (masterResume) {
        setSelectedResumeId(masterResume.id);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error(t("messages.loadJobFailed"));
      navigate("/jobs");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedResumeId) {
      toast.error(t("messages.pleaseSelectResume"));
      return;
    }

    if (!id) return;

    setIsSubmitting(true);

    try {
      const result = await jobService.applyToJob(id, {
        resumeId: selectedResumeId,
        coverLetter: coverLetter.trim() || undefined,
      });

      toast.success(t("messages.applicationSubmitted"));
      // If the job has a screening interview attached, land the candidate
      // directly on it — magic-link emails are still queued by the server
      // as a fallback, but the in-flow continuation is the killer UX vs
      // HireVue's "you'll get an email in a bit" round-trip.
      if (result.screening?.inviteToken) {
        navigate(`/interview/${result.screening.inviteToken}`);
      } else {
        navigate(`/jobs/${id}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t("messages.applicationSubmitFailed");
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
            <p className="text-center text-muted-foreground">{t("messages.jobNotFound")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 py-8">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => navigate(`/jobs/${id}`)}
        className="mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        {t("actions.backToJob")}
      </Button>

      {/* Job Summary */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2 mb-2">
                <Briefcase className="h-5 w-5" />
                {job.title || job.title}
              </CardTitle>
              {job.Company?.Name && (
                <CardDescription className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {job.Company.name}
                </CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Screening preview — only when the job has a question set attached. */}
      {screening?.hasScreening && (
        <Card className="mb-6 border-brand-purple/40 bg-brand-purple/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Video className="h-5 w-5 text-brand-purple" />
              {screening.screeningRequired === "required"
                ? "Step 2: Video screening (required)"
                : "Optional video screening after you apply"}
            </CardTitle>
            <CardDescription>
              After you submit, you'll be sent directly to a {screening.questionCount}-question screening
              interview {screening.expectedMinutes ? `(~${screening.expectedMinutes} min)` : ""}.
              {screening.proctoringOn
                ? " It's lightly proctored — keep this tab in focus while answering."
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2 text-xs">
              {typeof screening.prepTimeSec === "number" && (
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {screening.prepTimeSec}s prep per question
                </Badge>
              )}
              {typeof screening.maxRetakes === "number" && screening.maxRetakes > 0 && (
                <Badge variant="outline">{screening.maxRetakes} retakes allowed</Badge>
              )}
              <Badge variant="outline">Text or video answers</Badge>
            </div>
            {screening.screeningRequired === "required" && (
              <Alert>
                <AlertDescription className="text-xs">
                  This employer requires the screening to consider your application. You can
                  practise the question style with our AI Coach first if you want.
                </AlertDescription>
              </Alert>
            )}
            <Button asChild variant="ghost" size="sm" className="gap-1 -ml-2">
              <a href="/ai-coach">
                <MessageSquare className="h-3.5 w-3.5" />
                Warm up with AI Coach
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Application Form */}
      <Card>
        <CardHeader>
          <CardTitle>{t("headings.submitApplication")}</CardTitle>
          <CardDescription>
            {t("messages.applicationFormIntro")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Resume Selection */}
            <div className="space-y-2">
              <Label htmlFor="resume">{t("labels.selectResumeRequired")}</Label>
              {resumes.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  <p>{t("messages.noResumesYet")}</p>
                  <Button
                    type="button"
                    variant="link"
                    className="p-0 h-auto"
                    onClick={() => navigate("/studio?contentTemplate=resume-doc")}
                  >
                    {t("actions.createResumeFirst")}
                  </Button>
                </div>
              ) : (
                <Select
                  value={selectedResumeId}
                  onValueChange={setSelectedResumeId}
                  required
                >
                  <SelectTrigger id="resume">
                    <SelectValue placeholder={t("fields.resumeSelect.placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {resumes.map((resume) => (
                      <SelectItem key={resume.id} value={resume.id}>
                        {resume.title || t("labels.untitled")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Cover Letter */}
            <div className="space-y-2">
              <Label htmlFor="coverLetter">{t("labels.coverLetterOptional")}</Label>
              <Textarea
                id="coverLetter"
                placeholder={t("fields.coverLetter.placeholderIntro")}
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                rows={8}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                {t("messages.coverLetterTip")}
              </p>
            </div>

            {/* Applicant Info */}
            {user && (
              <div className="rounded-lg border p-4 bg-muted/50">
                <h4 className="text-sm font-medium mb-2">{t("headings.yourInformation")}</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p><strong>{t("fields.name.label")}:</strong> {user.firstName} {user.lastName}</p>
                  <p><strong>{t("fields.emailLabel")}:</strong> {user.email}</p>
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
                {t("actions.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !selectedResumeId || resumes.length === 0}
                className="flex-1"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("status.submitting")}
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    {t("actions.submitApplication")}
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
          <CardTitle className="text-base">{t("headings.applicationTips")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
            <li>{t("messages.applicationTip1")}</li>
            <li>{t("messages.applicationTip2")}</li>
            <li>{t("messages.applicationTip3")}</li>
            <li>{t("messages.applicationTip4")}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
