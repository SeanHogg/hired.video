// State + orchestration for /tools/skill-extractor.
//
// Owns: source-type / input state, saved resume/job queries, the three
// extraction paths (paste / file / saved entity), tool-run recording,
// and the soft auth gate. The "add extracted skills back to the source"
// save flow is composed from ./useSkillSaveBack; pure merge/filter logic
// lives in ./skill-extractor-shared.

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  groupSkillsByCategory,
  SKILL_CATEGORY_LABEL,
  type SkillExtractionResult,
  type SkillSourceType,
} from "@/components/SkillExtractionResults";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";
import { getResumeTextFromFile, isResumeTextFile } from "@/lib/services/resume-text";
import { resumeService } from "@/lib/services/resume-service";
import { jobService } from "@/lib/services/job-service";
import { useToolRunRecorder } from "@/lib/tools/use-tool-run-recorder";
import { useToolEntityParams } from "@/lib/tools/use-tool-entity-params";
import {
  FILE_SIZE_LIMIT_BYTES,
  SKILL_EXTRACTOR_TOOL_ID,
  filterSavedJobs,
  filterSavedResumes,
  type SkillExtractionPayload,
  type SkillResultSource,
} from "./skill-extractor-shared";
import { useSkillSaveBack } from "./useSkillSaveBack";

// The server accepts ONE of: `content` (paste/upload paths), `resumeId`
// (saved-resume path), or `jobId` (saved-job path). For the saved-entity
// paths the server loads the row itself and ships the structured JSON
// straight to the LLM — the client must NOT ship a serialised copy,
// because resumes blow past the 50k content cap once stringified
// (the bug from 2026-05-05) and a flat-text projection is strictly
// weaker than the structured JSON the LLM can already read.
async function runExtraction(payload: SkillExtractionPayload) {
  const response = await apiClient.post<SkillExtractionResult>(
    "/api/skillextractor/extract",
    payload,
  );
  return response.data;
}

export function useSkillExtractor() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  const { resumeId: deepLinkResumeId, jobId: deepLinkJobId } = useToolEntityParams();

  // Default to whichever entity context the user landed from. A resumeId
  // deep-link wins ties because the menu deep-links from a resume more
  // commonly than from a job.
  const [sourceType, setSourceType] = useState<SkillSourceType>(
    deepLinkResumeId ? "resume" : "job",
  );
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [selectedResumeId, setSelectedResumeId] = useState(deepLinkResumeId ?? "");
  const [selectedJobId, setSelectedJobId] = useState(deepLinkJobId ?? "");
  const [savedSearch, setSavedSearch] = useState("");
  const [result, setResult] = useState<SkillExtractionResult | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  const { recordRun } = useToolRunRecorder(SKILL_EXTRACTOR_TOOL_ID);

  // Single source of truth for what we persist on a skill-extraction run.
  // The three handler paths (paste / file / saved-resume-or-job) all
  // pipe the raw API response through this so the history sheet's
  // expandable view, Copy Report, and the entity-history rollup all
  // see the same NormalizedToolRunResult shape.
  const recordSkillRun = (
    extracted: SkillExtractionResult,
    refs: { resumeId?: string; jobId?: string },
  ) => {
    const grouped = groupSkillsByCategory(extracted.skills);
    const sourceLabel =
      extracted.sourceType === "job"
        ? t("labels.skillExtractor.sourceJobDescription")
        : t("labels.skillExtractor.sourceResume");
    void recordRun({
      score: null,
      result: {
        summary:
          extracted.summary ||
          t("messages.skillExtractor.runSummaryFromSource", {
            count: extracted.skills.length,
            source: sourceLabel,
          }),
        extras: grouped.map((g) => ({
          label: SKILL_CATEGORY_LABEL[g.category],
          value: g.skills.map((s) => s.name).join(", "),
        })),
        raw: extracted,
      },
      summary: t("messages.skillExtractor.runSummary", {
        count: extracted.skills.length,
      }),
      ...refs,
    });
  };

  const [resultSource, setResultSource] = useState<SkillResultSource | null>(null);
  const {
    isSaving,
    saveState,
    resetSaveState,
    previewResume,
    setPreviewResume,
    refreshPreviewResume,
    saveSkillsToSource,
  } = useSkillSaveBack();

  const { restored, snapshot, clear } = usePendingToolInput<{
    sourceType?: SkillSourceType;
    pastedText?: string;
    selectedResumeId?: string;
    selectedJobId?: string;
  }>();

  useEffect(() => {
    if (!restored || !isAuthenticated) return;
    if (restored.sourceType) setSourceType(restored.sourceType);
    if (restored.pastedText) setPastedText(restored.pastedText);
    if (restored.selectedResumeId) setSelectedResumeId(restored.selectedResumeId);
    if (restored.selectedJobId) setSelectedJobId(restored.selectedJobId);
  }, [restored, isAuthenticated]);

  // Saved items — fetched lazily per source type so we only hit the endpoint
  // the user actually needs.
  const { data: resumes = [] } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => resumeService.getUserResumes(),
    enabled: isAuthenticated && sourceType === "resume",
  });
  const { data: userJobs = [] } = useQuery({
    queryKey: ["user-jobs"],
    queryFn: () => jobService.getUserJobs(),
    enabled: isAuthenticated && sourceType === "job",
  });

  const filteredResumes = useMemo(
    () => filterSavedResumes(resumes, savedSearch),
    [resumes, savedSearch],
  );
  const filteredJobs = useMemo(
    () => filterSavedJobs(userJobs, savedSearch),
    [userJobs, savedSearch],
  );

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!isResumeTextFile(selected)) {
      setError(t("errors.uploadResumeFile"));
      return;
    }
    if (selected.size > FILE_SIZE_LIMIT_BYTES) {
      setError(t("errors.fileSizeMax10Mb"));
      return;
    }
    setFile(selected);
    setError(null);
    setResult(null);
  };

  const beginExtraction = () => {
    setIsExtracting(true);
    setError(null);
    setResult(null);
    setResultSource(null);
    resetSaveState();
  };

  const handleTextExtraction = async () => {
    if (!pastedText.trim()) {
      setError(
        sourceType === "job"
          ? t("errors.skillExtractor.pasteJobDescription")
          : t("errors.skillExtractor.pasteResume"),
      );
      return;
    }

    if (!isAuthenticated) {
      snapshot({ sourceType, pastedText });
      setShowAuthOverlay(true);
      return;
    }

    beginExtraction();
    try {
      const extracted = await runExtraction({ sourceType, content: pastedText });
      setResult(extracted);
      recordSkillRun(extracted, {});
      clear();
    } catch (err: any) {
      setError(err?.message || t("errors.skillExtractor.extractFailed"));
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileExtraction = async () => {
    if (!file) return;

    if (!isAuthenticated) {
      snapshot({ sourceType });
      setShowAuthOverlay(true);
      return;
    }

    beginExtraction();
    try {
      const text = await getResumeTextFromFile(file);
      if (!text.trim()) {
        setError(t("errors.couldNotExtractText"));
        return;
      }
      const extracted = await runExtraction({ sourceType, content: text });
      setResult(extracted);
      recordSkillRun(extracted, {});
      clear();
    } catch (err: any) {
      setError(err?.message || t("skillExtractor.fileExtractFailed"));
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSavedExtraction = async () => {
    const targetId = sourceType === "resume" ? selectedResumeId : selectedJobId;
    if (!targetId) return;

    if (!isAuthenticated) {
      snapshot({
        sourceType,
        selectedResumeId,
        selectedJobId,
      });
      setShowAuthOverlay(true);
      return;
    }

    beginExtraction();
    try {
      let label = "";
      let extracted: SkillExtractionResult;
      if (sourceType === "resume") {
        // Saved-resume path: load locally for the label + right-pane
        // SkillNetwork preview, but ship only the resumeId to the API.
        // The server re-loads the resume by id (with an owner check) and
        // hands the structured ResumeContent JSON to the LLM — sections,
        // highlights, and item ids stay intact. Re-shipping
        // JSON.stringify(content) as `content` was the cause of the 50k
        // VALIDATION_ERROR users hit on /Tools/SkillExtractor.
        const resume = await resumeService.getResumeById(targetId);
        if (!resume.content) {
          throw new Error(t("skillExtractor.resumeNoContent"));
        }
        label = resume.title || t("labels.skillExtractor.sourceResume");
        setPreviewResume({
          id: resume.id,
          userId: resume.userId,
          content: resume.content,
        });
        extracted = await runExtraction({ resumeId: targetId });
      } else {
        // Saved-job path: same idea — ship just the jobId, let the server
        // project the row into ParsedJob and pass it to the LLM as JSON
        // (responsibilities/requirements arrays preserved). Drops the
        // client-side description-string assembly and the 50k cliff edge.
        setPreviewResume(null);
        const job = await jobService.getJobById(targetId);
        label =
          [job?.title, job?.company].filter(Boolean).join(" — ") || t("skillExtractor.jobFallbackLabel");
        extracted = await runExtraction({ jobId: targetId });
      }
      setResult(extracted);
      setResultSource({ type: sourceType, id: targetId, label });
      recordSkillRun(extracted, {
        resumeId: sourceType === "resume" ? targetId : undefined,
        jobId: sourceType === "job" ? targetId : undefined,
      });
      clear();
    } catch (err: any) {
      setError(err?.message || t("errors.skillExtractor.extractFailed"));
    } finally {
      setIsExtracting(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
    setResult(null);
  };

  const reset = () => {
    setFile(null);
    setPastedText("");
    setSelectedResumeId("");
    setSelectedJobId("");
    setSavedSearch("");
    setError(null);
    setResult(null);
    setResultSource(null);
    resetSaveState();
  };

  const handleSaveSkillsToSource = () => saveSkillsToSource(result, resultSource);

  // Reset saved-item selection when toggling between job and resume so a
  // leftover resumeId doesn't linger when the user switches to jobs.
  const handleSourceTypeChange = (next: SkillSourceType) => {
    setSourceType(next);
    setSelectedResumeId("");
    setSelectedJobId("");
    setSavedSearch("");
  };

  return {
    isAuthenticated,
    sourceType,
    handleSourceTypeChange,
    file,
    handleFileChange,
    removeFile,
    pastedText,
    setPastedText,
    selectedResumeId,
    setSelectedResumeId,
    selectedJobId,
    setSelectedJobId,
    savedSearch,
    setSavedSearch,
    filteredResumes,
    filteredJobs,
    result,
    resultSource,
    previewResume,
    refreshPreviewResume,
    isExtracting,
    error,
    showAuthOverlay,
    isSaving,
    saveState,
    handleTextExtraction,
    handleFileExtraction,
    handleSavedExtraction,
    handleSaveSkillsToSource,
    reset,
  };
}
