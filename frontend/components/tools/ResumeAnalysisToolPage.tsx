// Shared shell behind /tools/resume-optimizer and /tools/ai-resume-scorer.
//
// Both pages used to be ~800-line copy-paste duplicates that called
// different endpoints. Now both are AI tools on the one dispatcher
// (aiToolPath("resume-optimize") / aiToolPath("resume-score")) backed by the same
// services/resume/analyze.ts engine and return the merged
// `ResumeAnalysisSchema` shape, so this one component renders both —
// Optimizer adds a Job Description textarea, Scorer leads with the
// grade chip; everything else is self-gated on what's present in the
// response.
//
// Adding the page was a pure DRY collapse: the only differences worth
// keeping per-page are the header copy, the endpoint slug (so
// tool-runs history stays distinguishable), and whether to show the
// Job Description textarea. Everything else flows through as data.
//
// Presentational pieces live in ./resume-analysis/ (input card, result
// panel, preview + empty-state cards, shared types/helpers).

import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ToolShell } from "@/components/tools/ToolShell";
import { ResumeAnalysisInputCard } from "@/components/tools/resume-analysis/ResumeAnalysisInputCard";
import { ResumeAnalysisResultPanel } from "@/components/tools/resume-analysis/ResumeAnalysisResultPanel";
import {
  ResumeAnalysisEmptyStateCard,
  ResumeAnalysisProPreviewCard,
} from "@/components/tools/resume-analysis/ResumeAnalysisSideCards";
import {
  buildResumeAnalysisReport,
  type ResumeAnalysisResult,
} from "@/components/tools/resume-analysis/resume-analysis-shared";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";
import { streamAiJson } from "@/lib/services/ai-stream";
import { StreamingAnswerPreview } from "@/components/tools/StreamingAnswerPreview";
import { getResumeTextFromFile, isResumeTextFile } from "@/lib/services/resume-text";
import { useToolRunRecorder } from "@/lib/tools/use-tool-run-recorder";
import { useToolEntityParams } from "@/lib/tools/use-tool-entity-params";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { useUserResumes } from "@/hooks/queries/use-resumes";

export type { ResumeAnalysisResult } from "@/components/tools/resume-analysis/resume-analysis-shared";

interface ResumeAnalysisToolPageProps {
  /** Tool id used by useToolRunRecorder + ToolPageHeader. */
  toolId: string;
  header: {
    icon: ReactNode;
    title: string;
    description: string;
    titleExtras?: ReactNode;
  };
  /** Optional info-card rendered above the input form (e.g. "How it works"). */
  infoCard?: ReactNode;
  submit: { label: string; loadingLabel: string; icon: LucideIcon };
  /** API endpoint to POST `{ resumeText, resumeId?, jobDescription? }` to. */
  endpoint: string;
  /** Whether to render the Job Description textarea on every tab. */
  showJobDescription?: boolean;
  /** Heading on the Copy Report output. */
  reportLabel: string;
  emptyState: { title: string; blurb: string; bullets: string[] };
}

const FILE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;

/** What the streamed analysis shows while it is written: what it found, then each fix. */
const STREAMED_ANALYSIS_KEYS = ["title"] as const;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ResumeAnalysisToolPage({
  toolId,
  header,
  infoCard,
  submit,
  endpoint,
  showJobDescription,
  reportLabel,
  emptyState,
}: ResumeAnalysisToolPageProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  const { recordRun } = useToolRunRecorder(toolId);
  const { resumeId: deepLinkResumeId } = useToolEntityParams();

  const [file, setFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [selectedResumeId, setSelectedResumeId] = useState(deepLinkResumeId ?? "");
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState<ResumeAnalysisResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  const { restored, snapshot, clear } = usePendingToolInput<{
    resumeText?: string;
    selectedResumeId?: string;
    jobDescription?: string;
  }>();

  useEffect(() => {
    if (!restored || !isAuthenticated) return;
    if (restored.resumeText) setResumeText(restored.resumeText);
    if (restored.selectedResumeId) setSelectedResumeId(restored.selectedResumeId);
    if (restored.jobDescription) setJobDescription(restored.jobDescription);
  }, [restored, isAuthenticated]);

  const { data: resumes } = useUserResumes();

  // ─── File handling ──────────────────────────────────────────────────────

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    if (!isResumeTextFile(selectedFile)) {
      setError(t("toolSteps.analysis.unsupportedFileType"));
      return;
    }
    if (selectedFile.size > FILE_SIZE_LIMIT_BYTES) {
      setError(t("errors.fileSizeMax10Mb"));
      return;
    }
    setFile(selectedFile);
    setError(null);
    setResult(null);
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
    setResult(null);
  };

  const reset = () => {
    setFile(null);
    setResumeText("");
    setSelectedResumeId("");
    setJobDescription("");
    setError(null);
    setResult(null);
  };

  // ─── Submit pipeline ────────────────────────────────────────────────────

  async function callApi(content: string | undefined, opts: { resumeId?: string }) {
    const trimmed = content?.trim() ?? "";
    if (!trimmed && !opts.resumeId) {
      throw new Error(t("errors.resumeContentRequired"));
    }
    // Build the body with only the fields that have values — paste-text
    // and upload flows ship `resumeText`; the saved-resume flow ships
    // only `resumeId` and the backend resolver fetches the JSON content
    // server-side (no point round-tripping the user's own resume).
    const body: Record<string, unknown> = {};
    if (trimmed) body.resumeText = content;
    if (opts.resumeId) body.resumeId = opts.resumeId;
    if (showJobDescription && jobDescription) body.jobDescription = jobDescription;
    // Streamed (#1342): the recommendations appear as the model writes them.
    return streamAiJson<ResumeAnalysisResult>(endpoint, body, { onText: setStreamText });
  }

  function recordAfterRun(r: ResumeAnalysisResult, opts: { resumeId?: string }) {
    // Normalise into the shared NormalizedToolRunResult shape used by the
    // history sheet's ToolRunResultPanel. Most fields line up directly
    // with the analysis response, so this is a near-pass-through; the
    // only real translation is `recommendation.severity` → `category`,
    // since the panel uses `category` as the severity axis (the legacy
    // analysis schema overloaded `category` for diagnostic buckets).
    void recordRun({
      score: typeof r.overallScore === "number" ? r.overallScore : null,
      result: {
        overallScore: r.overallScore,
        grade: r.grade,
        categoryScores: [
          { label: "ATS", score: r.atsScore },
          { label: "Content", score: r.contentScore },
          { label: "Keywords", score: r.keywordScore },
          { label: "Format", score: r.formatScore },
          ...(typeof r.impactScore === "number"
            ? [{ label: "Impact", score: r.impactScore }]
            : []),
        ],
        strengths: r.strengths,
        weaknesses: r.weaknesses,
        recommendations: r.recommendations.map((rec) => ({
          category: rec.severity,
          title: rec.title,
          description: rec.description,
          impact: rec.impact,
        })),
        raw: r,
      },
      summary: r.grade
        ? `Score ${Math.round(r.overallScore)} (${r.grade})`
        : `Score ${Math.round(r.overallScore)}`,
      resumeId: opts.resumeId,
      jobDescription: jobDescription || undefined,
    });
  }

  async function runWithGuard(
    work: () => Promise<{ result: ResumeAnalysisResult; resumeId?: string }>,
    failureMessage: string,
  ) {
    setIsRunning(true);
    setError(null);
    setResult(null);
    setStreamText("");
    try {
      const out = await work();
      setResult(out.result);
      recordAfterRun(out.result, { resumeId: out.resumeId });
      clear();
    } catch (err: any) {
      setError(err?.message ?? failureMessage);
    } finally {
      setIsRunning(false);
    }
  }

  const requireAuth = (snapshotPayload: Record<string, unknown>) => {
    snapshot(snapshotPayload as any);
    setShowAuthOverlay(true);
  };

  const handleTextSubmit = () => {
    if (!resumeText.trim()) {
      setError(t("toolSteps.analysis.enterResumeText"));
      return;
    }
    if (!isAuthenticated) {
      requireAuth({ resumeText, jobDescription });
      return;
    }
    void runWithGuard(
      async () => ({ result: await callApi(resumeText, {}) }),
      t("toolSteps.analysis.analyzeFailed"),
    );
  };

  const handleFileSubmit = () => {
    if (!file) return;
    if (!isAuthenticated) {
      requireAuth({ jobDescription });
      return;
    }
    void runWithGuard(async () => {
      const extracted = await getResumeTextFromFile(file);
      if (!extracted.trim()) {
        throw new Error(t("errors.couldNotExtractText"));
      }
      const { data: parseResult } = await apiClient.post<{ result?: string }>(
        "/api/resumes/parse",
        { content: extracted },
      );
      const content =
        (typeof parseResult?.result === "string" ? parseResult.result : "") || extracted;
      return { result: await callApi(content, {}) };
    }, t("toolSteps.analysis.analyzeFileFailed"));
  };

  const handleResumeSubmit = () => {
    if (!selectedResumeId) return;
    if (!isAuthenticated) {
      requireAuth({ selectedResumeId, jobDescription });
      return;
    }
    void runWithGuard(async () => {
      const r = await callApi(undefined, { resumeId: selectedResumeId });
      return { result: r, resumeId: selectedResumeId };
    }, t("toolSteps.analysis.analyzeFailed"));
  };

  // ─── Helpers for the recommendations panel ──────────────────────────────

  const activeResumeIdForActions = selectedResumeId || undefined;

  const buildReport = (r: ResumeAnalysisResult) =>
    buildResumeAnalysisReport(r, { reportLabel, toolTitle: header.title, t });

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <ToolShell
      toolId={toolId}
      header={{
        icon: header.icon,
        title: header.title,
        description: header.description,
        titleExtras: header.titleExtras,
      }}
      authOverlay={{
        show: showAuthOverlay,
        message: t("toolSteps.analysis.authOverlay", { name: header.title }),
      }}
    >
      {infoCard && <div>{infoCard}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {/* Left — input */}
        <div className="space-y-6">
          <ResumeAnalysisInputCard
            title={header.title}
            isAuthenticated={isAuthenticated}
            isRunning={isRunning}
            submit={submit}
            error={error}
            resumes={resumes}
            resumeText={resumeText}
            onResumeTextChange={setResumeText}
            file={file}
            onFileChange={handleFileChange}
            onRemoveFile={removeFile}
            selectedResumeId={selectedResumeId}
            onSelectedResumeIdChange={setSelectedResumeId}
            showJobDescription={showJobDescription}
            jobDescription={jobDescription}
            onJobDescriptionChange={setJobDescription}
            onTextSubmit={handleTextSubmit}
            onFileSubmit={handleFileSubmit}
            onResumeSubmit={handleResumeSubmit}
          />
        </div>

        {/* Right — results */}
        <div className="space-y-6">
          {result?.isProPreview ? (
            <ResumeAnalysisProPreviewCard result={result} />
          ) : result ? (
            <ResumeAnalysisResultPanel
              result={result}
              resumeIdForActions={activeResumeIdForActions}
              onReset={reset}
              buildReport={buildReport}
            />
          ) : !isRunning ? (
            <ResumeAnalysisEmptyStateCard
              icon={header.icon}
              title={emptyState.title}
              blurb={emptyState.blurb}
              bullets={emptyState.bullets}
            />
          ) : (
            <StreamingAnswerPreview text={streamText} keys={STREAMED_ANALYSIS_KEYS} />
          )}
        </div>
      </div>
    </ToolShell>
  );
}
