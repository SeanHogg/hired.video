// State for /tools/resume-tailor — an ENTRY POINT into the kit workspace now: pick the
// job (pasted, a text file, or a tracked job) and the résumé to start from
// (the ★ master by default), then hand off. The kit workspace tailors it in preview,
// shows every change on the page with its why, and saves a version of the
// master only when asked (useTailorReview); "Create a new one" builds a
// version from the master's evidence instead (useJobDraftReview).
//
// Keeps the soft auth gate: an anonymous visitor's job text and pick are
// snapshotted and restored after sign-in.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { useAuth } from "@/lib/auth";
import { jobService } from "@/lib/services/job-service";
import { resumeService } from "@/lib/services/resume-service";
import { useToolEntityParams } from "@/lib/tools/use-tool-entity-params";
import { useOpenReview } from "@/lib/tools/use-open-review";

export type JobSource = "paste" | "upload" | "saved";

const TEXT_FILE = { mime: /^text\/|application\/json/, ext: /\.(txt|md|html?|json|jd)$/i };

export function useTailorHandoff() {
  const { t } = useTranslation();
  const openReview = useOpenReview();
  const { isAuthenticated, user } = useAuth();
  const { resumeId: deepLinkResumeId, jobId: deepLinkJobId } = useToolEntityParams();

  const [jobSource, setJobSource] = useState<JobSource>(deepLinkJobId ? "saved" : "paste");
  const [jobDescription, setJobDescription] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [selectedJobId, setSelectedJobId] = useState(deepLinkJobId ?? "");
  const [pickedResumeId, setSelectedResumeId] = useState(deepLinkResumeId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  const { restored, snapshot, clear } = usePendingToolInput<{ jobDescription?: string; selectedResumeId?: string }>();
  useEffect(() => {
    if (!restored || !isAuthenticated) return;
    if (restored.jobDescription) setJobDescription(restored.jobDescription);
    if (restored.selectedResumeId) setSelectedResumeId(restored.selectedResumeId);
  }, [restored, isAuthenticated]);

  const resumes = useQuery({
    queryKey: ["resumes", user?.id],
    queryFn: () => resumeService.getUserResumes(),
    enabled: isAuthenticated && !!user?.id,
  });
  const savedJobs = useQuery({
    queryKey: ["saved-jobs", user?.id],
    queryFn: () => jobService.getSavedJobs(),
    enabled: isAuthenticated && !!user?.id,
  });

  // Tailoring starts from the master unless another résumé is picked.
  const masterId = useMemo(
    () => (resumes.data ?? []).find((r) => (r as { isMaster?: boolean }).isMaster)?.id ?? (resumes.data?.[0]?.id as string | undefined) ?? "",
    [resumes.data],
  );
  const selectedResumeId = pickedResumeId || masterId;

  const canContinue = jobSource === "saved" ? selectedJobId.trim().length > 0 : jobDescription.trim().length > 0;

  const readFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!TEXT_FILE.mime.test(file.type) && !TEXT_FILE.ext.test(file.name)) {
        setError(t("errors.unsupportedJobDescriptionFile"));
        return;
      }
      try {
        setJobDescription(await file.text());
        setUploadedFileName(file.name);
      } catch {
        setError(t("errors.couldNotReadFilePasteInstead"));
      }
    },
    [t],
  );

  /** Open the kit workspace with the job: tailor the résumé, or (`create`) build a new
   *  version for the job from the master's evidence. */
  const handOff = useCallback(
    (create: boolean) => {
      if (!canContinue) {
        setError(jobSource === "saved" ? t("errors.pickSavedJobFirst") : t("errors.enterJobDescriptionFirst"));
        return;
      }
      if (!isAuthenticated) {
        snapshot({ jobDescription, selectedResumeId });
        setShowAuthOverlay(true);
        return;
      }
      if (!selectedResumeId) {
        setError(t("review.handoff.needResume"));
        return;
      }
      clear();
      if (jobSource === "saved") {
        const job = savedJobs.data?.find((j) => j.id === selectedJobId);
        const label = job ? [job.title, job.company].filter(Boolean).join(" · ") : "";
        openReview(selectedResumeId, { kind: "job", create, job: { jobId: selectedJobId, label } });
      } else {
        const label = uploadedFileName || jobDescription.trim().split("\n")[0].slice(0, 80);
        openReview(selectedResumeId, { kind: "job", create, job: { jobHtml: jobDescription, label } });
      }
    },
    [canContinue, jobSource, isAuthenticated, snapshot, jobDescription, selectedResumeId, clear, savedJobs.data, selectedJobId, openReview, uploadedFileName, t],
  );

  return {
    isAuthenticated,
    jobSource,
    setJobSource,
    jobDescription,
    setJobDescription,
    uploadedFileName,
    readFile,
    selectedJobId,
    setSelectedJobId,
    selectedResumeId,
    setSelectedResumeId,
    resumes: resumes.data ?? [],
    resumesLoading: resumes.isLoading,
    savedJobs: savedJobs.data ?? [],
    savedJobsLoading: savedJobs.isLoading,
    error,
    showAuthOverlay,
    canContinue,
    handOff,
  };
}
