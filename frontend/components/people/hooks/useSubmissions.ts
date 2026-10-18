import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import type { TalentPoolEntry } from "@/lib/services/recruiter-service";
import {
  submissionService,
  type SubmissionDTO,
  type SubmissionFilters,
} from "@/lib/services/submission-service";
import {
  EMPTY_SUBMIT_TO_JOB_FORM,
  isHiringSideRole,
  type SubmitToJobForm,
  type UserJobOption,
} from "@/components/people/people-helpers";

/**
 * Hiring-side Submissions tab (recruiter / employer / admin / SA): the
 * submissions list plus the Submit-to-Job dialog opened from a Talent Pool
 * entry.
 */
export function useSubmissions({
  activeTab,
  isAuthenticated,
  user,
}: {
  activeTab: string;
  isAuthenticated: boolean;
  user: { role?: string } | null;
}) {
  const { t } = useTranslation();
  const [submissions, setSubmissions] = useState<SubmissionDTO[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionFilters] = useState<SubmissionFilters>({});
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [candidateToSubmit, setCandidateToSubmit] = useState<TalentPoolEntry | null>(null);
  const [submitForm, setSubmitForm] = useState<SubmitToJobForm>(EMPTY_SUBMIT_TO_JOB_FORM);
  const [availableJobs, setAvailableJobs] = useState<UserJobOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const loadSubmissions = async () => {
    try {
      setSubmissionsLoading(true);
      const data = await submissionService.getSubmissions(submissionFilters);
      setSubmissions(data);
    } catch (error) {
      console.error("Failed to load submissions:", error);
      toast.error(t("messages.failedToLoadSubmissions"));
    } finally {
      setSubmissionsLoading(false);
    }
  };

  // Load submissions when tab changes (hiring-side: recruiter / employer / admin / SA)
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (isHiringSideRole(user.role) && activeTab === "submissions") {
      loadSubmissions();
    }
  }, [activeTab, isAuthenticated, user, submissionFilters]);

  const handleSubmitToJob = async (candidate: TalentPoolEntry) => {
    setCandidateToSubmit(candidate);
    setSubmitForm(EMPTY_SUBMIT_TO_JOB_FORM);

    // Load available jobs
    try {
      const response = await apiClient.get<UserJobOption[]>("/api/jobs/user-jobs");
      setAvailableJobs(response.data || []);
    } catch (error) {
      console.error("Failed to load jobs:", error);
      toast.error(t("messages.failedToLoadJobs"));
    } finally {
      setSubmitDialogOpen(true);
    }
  };

  const handleSubmitCandidate = async () => {
    if (!candidateToSubmit || !submitForm.jobId) {
      toast.error(t("messages.pleaseSelectJob"));
      return;
    }

    try {
      setSubmitting(true);
      await submissionService.submitCandidate({
        candidateUserId: candidateToSubmit.candidateUserId,
        jobId: submitForm.jobId,
        resumeId: submitForm.resumeId || undefined,
        coverLetter: submitForm.coverLetter || undefined,
        recruiterNotes: submitForm.recruiterNotes || undefined,
        proposedSalary: submitForm.proposedSalary ? parseFloat(submitForm.proposedSalary) : undefined,
        availableStartDate: submitForm.availableStartDate || undefined,
      });

      toast.success(t("messages.candidateSubmitted"));
      setSubmitDialogOpen(false);
      loadSubmissions(); // Refresh submissions list
    } catch (error) {
      console.error("Failed to submit candidate:", error);
      toast.error(error instanceof Error ? error.message : t("messages.failedToSubmitCandidate"));
    } finally {
      setSubmitting(false);
    }
  };

  return {
    submissions,
    submissionsLoading,
    submitDialogOpen,
    setSubmitDialogOpen,
    candidateToSubmit,
    submitForm,
    setSubmitForm,
    availableJobs,
    submitting,
    handleSubmitToJob,
    handleSubmitCandidate,
  };
}
