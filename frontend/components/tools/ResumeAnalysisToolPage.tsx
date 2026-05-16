// Shared shell behind /tools/resume-optimizer and /tools/ai-resume-scorer.
//
// Both pages used to be ~800-line copy-paste duplicates that called
// different endpoints (/api/resumeoptimizer/optimize vs
// /api/resumescorer/score). Now both endpoints proxy to the same
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

import { useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Loader2,
  TrendingUp,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToolShell } from "@/components/tools/ToolShell";
import ResumeSelectItem from "@/components/tools/ResumeSelectItem";
import { RecommendationActionButton } from "@/components/tools/RecommendationActionButton";
import { useAuth } from "@/lib/auth";
import { resumeService } from "@/lib/services/resume-service";
import { apiClient } from "@/lib/api-client";
import { extractTextFromFile } from "@/lib/extract-text";
import { useToolRunRecorder } from "@/lib/tools/use-tool-run-recorder";
import { useToolEntityParams } from "@/lib/tools/use-tool-entity-params";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";

// ---------------------------------------------------------------------------
// Shared result shape — superset of what Scorer and Optimizer surface.
// Mirrors `ResumeAnalysis` in shared/tool-schemas.ts. Every field except
// scores + recommendations is optional; the UI self-gates on presence.
// ---------------------------------------------------------------------------

export interface ResumeAnalysisResult {
  overallScore: number;
  grade?: string;
  atsScore: number;
  contentScore: number;
  keywordScore: number;
  formatScore: number;
  impactScore?: number;
  strengths?: string[];
  weaknesses?: string[];
  recommendations: Array<{
    severity?: "critical" | "important" | "minor";
    /** Some legacy backends still return `category` as the severity
     *  axis. The shell treats `category` as the diagnostic bucket
     *  (ats/keywords/format/...) and falls back to `severity`'s field
     *  when only one is present. */
    category?: string;
    title: string;
    description: string;
    impact?: number | string;
    /** Optional sample bullet the analyzer quoted — passed to the
     *  Action button so consolidate / shorten wands can locate it. */
    matchHighlight?: string;
  }>;
  optimizedContent?: string;
  /** Free-tier preview marker. When true, the response carries only
   *  score + grade + a teaser; the page renders an upgrade card. */
  isProPreview?: true;
  upgradeUrl?: string;
  teaserRecommendation?: { title: string; impact?: number | string } | null;
}

interface ResumeAnalysisToolPageProps {
  /** Tool id used by useToolRunRecorder + ToolPageHeader. */
  toolId: string;
  header: {
    icon: ReactNode;
    iconBgClassName: string;
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

// ---------------------------------------------------------------------------
// Score / grade helpers — unified thresholds. The legacy Scorer used
// 85/70 and the Optimizer used 80/60; collapsing here is a DRY fix
// for the divergence flagged in the gap register.
// ---------------------------------------------------------------------------

function getScoreColor(score: number): string {
  if (score >= 85) return "text-green-600";
  if (score >= 70) return "text-yellow-600";
  return "text-red-600";
}

function getGradeColor(grade: string): string {
  if (grade.startsWith("A")) return "text-green-600 bg-green-100";
  if (grade.startsWith("B")) return "text-blue-600 bg-blue-100";
  if (grade.startsWith("C")) return "text-yellow-600 bg-yellow-100";
  return "text-red-600 bg-red-100";
}

function getRecommendationBadgeColor(severity: string | undefined): string {
  switch (severity) {
    case "critical":
      return "bg-red-100 text-red-800";
    case "important":
      return "bg-yellow-100 text-yellow-800";
    default:
      return "bg-blue-100 text-blue-800";
  }
}

const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/json",
  "application/ld+json",
];

const FILE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Quote-matcher: pull the longest `"…"` phrase out of a recommendation's
// description. The analyzer prompt asks the LLM to quote phrases from the
// resume verbatim — that's our hook for matching the bullet on the
// consolidate / shorten wands without needing a separate `target`
// field on every recommendation.
// ---------------------------------------------------------------------------

function extractMatchHighlight(rec: { description: string }): string | undefined {
  const matches = Array.from(rec.description.matchAll(/['"]([^'"]{8,500})['"]/g));
  if (matches.length === 0) return undefined;
  // Longest quote tends to be the actual bullet, not a single keyword.
  matches.sort((a, b) => b[1].length - a[1].length);
  return matches[0][1];
}

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
  const { isAuthenticated } = useAuth();

  const { recordRun } = useToolRunRecorder(toolId);
  const { resumeId: deepLinkResumeId } = useToolEntityParams();

  const [file, setFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [selectedResumeId, setSelectedResumeId] = useState(deepLinkResumeId ?? "");
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState<ResumeAnalysisResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
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

  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => resumeService.getUserResumes(),
    enabled: isAuthenticated,
  });

  // ─── File handling ──────────────────────────────────────────────────────

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    if (!ALLOWED_FILE_TYPES.includes(selectedFile.type)) {
      setError("Please upload a PDF, Word, Markdown, JSON, or text file.");
      return;
    }
    if (selectedFile.size > FILE_SIZE_LIMIT_BYTES) {
      setError("File size must be less than 10MB.");
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
      throw new Error("Resume content is required.");
    }
    // Build the body with only the fields that have values — paste-text
    // and upload flows ship `resumeText`; the saved-resume flow ships
    // only `resumeId` and the backend resolver fetches the JSON content
    // server-side (no point round-tripping the user's own resume).
    const body: Record<string, unknown> = {};
    if (trimmed) body.resumeText = content;
    if (opts.resumeId) body.resumeId = opts.resumeId;
    if (showJobDescription && jobDescription) body.jobDescription = jobDescription;
    const response = await apiClient.post(endpoint, body);
    return response.data as ResumeAnalysisResult;
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
      setError("Please enter resume text.");
      return;
    }
    if (!isAuthenticated) {
      requireAuth({ resumeText, jobDescription });
      return;
    }
    void runWithGuard(
      async () => ({ result: await callApi(resumeText, {}) }),
      "Failed to analyze resume.",
    );
  };

  const handleFileSubmit = () => {
    if (!file) return;
    if (!isAuthenticated) {
      requireAuth({ jobDescription });
      return;
    }
    void runWithGuard(async () => {
      const extracted = await extractTextFromFile(file);
      if (!extracted.trim()) {
        throw new Error("Could not extract text from this file.");
      }
      const { data: parseResult } = await apiClient.post<{ result?: string }>(
        "/api/resume/parse",
        { content: extracted },
      );
      const content =
        (typeof parseResult?.result === "string" ? parseResult.result : "") || extracted;
      return { result: await callApi(content, {}) };
    }, "Failed to analyze resume file.");
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
    }, "Failed to analyze resume.");
  };

  // ─── Helpers for the recommendations panel ──────────────────────────────

  const activeResumeIdForActions = selectedResumeId || undefined;

  // Build the Copy Report. Self-gates on which fields are present on
  // the result so the same template covers both Scorer and Optimizer.
  function buildReport(r: ResumeAnalysisResult): string {
    const lines: string[] = [reportLabel, ""];
    lines.push(`Overall Score: ${r.overallScore}%${r.grade ? ` (${r.grade})` : ""}`);
    lines.push("");
    lines.push("Detailed Scores:");
    lines.push(`- ATS Compatibility: ${r.atsScore}%`);
    lines.push(`- Content Quality: ${r.contentScore}%`);
    lines.push(`- Keywords: ${r.keywordScore}%`);
    lines.push(`- Format: ${r.formatScore}%`);
    if (typeof r.impactScore === "number") lines.push(`- Impact: ${r.impactScore}%`);
    if (r.strengths?.length) {
      lines.push("", "Strengths:");
      for (const s of r.strengths) lines.push(`- ${s}`);
    }
    if (r.weaknesses?.length) {
      lines.push("", "Areas for Improvement:");
      for (const w of r.weaknesses) lines.push(`- ${w}`);
    }
    if (r.recommendations.length) {
      lines.push("", "Recommendations:");
      for (const rec of r.recommendations) lines.push(`- ${rec.title}: ${rec.description}`);
    }
    lines.push("", `Generated by hired.video ${header.title}`);
    return lines.join("\n");
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  const submitButton = (
    onClick: () => void,
    disabled: boolean,
  ) => (
    <Button onClick={onClick} disabled={disabled} className="w-full">
      {isRunning ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          {submit.loadingLabel}
        </>
      ) : (
        <>
          <submit.icon className="h-4 w-4 mr-2" />
          {submit.label}
        </>
      )}
    </Button>
  );

  const jobDescriptionField = showJobDescription ? (
    <div>
      <label className="text-sm font-medium mb-2 block">
        Job Description (Optional)
      </label>
      <Textarea
        placeholder="Paste the job description to get targeted suggestions..."
        value={jobDescription}
        onChange={(e) => setJobDescription(e.target.value)}
        className="min-h-[100px]"
      />
    </div>
  ) : null;

  return (
    <ToolShell
      toolId={toolId}
      header={{
        icon: header.icon,
        iconBgClassName: header.iconBgClassName,
        title: header.title,
        description: header.description,
        titleExtras: header.titleExtras,
      }}
      authOverlay={{
        show: showAuthOverlay,
        message: `Sign in to run ${header.title} — we'll keep what you've entered and resume automatically.`,
      }}
    >
      {infoCard && <div>{infoCard}</div>}

      <div className="grid lg:grid-cols-2 gap-8">
            {/* Left — input */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    {header.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs
                    defaultValue={isAuthenticated ? "existing" : "text"}
                    className="w-full"
                  >
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="text">Paste Text</TabsTrigger>
                      <TabsTrigger value="upload">Upload File</TabsTrigger>
                      <TabsTrigger value="existing" disabled={!isAuthenticated}>
                        My Resumes {!isAuthenticated && "(Login Required)"}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="text" className="space-y-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Resume Text
                        </label>
                        <Textarea
                          placeholder="Paste your resume text here..."
                          value={resumeText}
                          onChange={(e) => setResumeText(e.target.value)}
                          className="min-h-[150px]"
                        />
                      </div>
                      {jobDescriptionField}
                      {submitButton(handleTextSubmit, isRunning || !resumeText.trim())}
                    </TabsContent>

                    <TabsContent value="upload" className="space-y-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Upload Resume File
                        </label>
                        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                          <input
                            type="file"
                            onChange={handleFileChange}
                            accept=".pdf,.doc,.docx,.txt,.md,.json"
                            className="hidden"
                            id="resume-upload"
                          />
                          <label htmlFor="resume-upload" className="cursor-pointer">
                            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">
                              Click to upload or drag and drop
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              PDF, Word, Markdown, JSON, or Text files (max 10MB)
                            </p>
                          </label>
                        </div>
                      </div>

                      {file && (
                        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <span className="text-sm font-medium">{file.name}</span>
                          <Button variant="ghost" size="sm" onClick={removeFile}>
                            Remove
                          </Button>
                        </div>
                      )}

                      {jobDescriptionField}
                      {submitButton(handleFileSubmit, isRunning || !file)}
                    </TabsContent>

                    <TabsContent value="existing" className="space-y-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Select Resume
                        </label>
                        <Select
                          value={selectedResumeId}
                          onValueChange={setSelectedResumeId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a resume" />
                          </SelectTrigger>
                          <SelectContent>
                            {resumes
                              ?.filter((r) => r.Id || r.id)
                              .map((r) => (
                                <ResumeSelectItem
                                  key={(r.id as string | undefined)!}
                                  resume={r as any}
                                />
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {jobDescriptionField}
                      {submitButton(handleResumeSubmit, isRunning || !selectedResumeId)}
                    </TabsContent>
                  </Tabs>

                  {error && (
                    <Alert className="mt-4">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right — results */}
            <div className="space-y-6">
              {result?.isProPreview ? (
                <Card>
                  <CardContent className="p-8 text-center space-y-3">
                    <div className={`text-4xl font-bold ${getScoreColor(result.overallScore)}`}>
                      {result.overallScore}
                    </div>
                    {result.grade && (
                      <div
                        className={`inline-flex items-center px-3 py-1 rounded-full text-lg font-semibold ${getGradeColor(result.grade)}`}
                      >
                        {result.grade}
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {result.teaserRecommendation
                        ? `Teaser: ${result.teaserRecommendation.title}`
                        : "Upgrade to see the full breakdown."}
                    </p>
                    {result.upgradeUrl && (
                      <Button asChild>
                        <a href={result.upgradeUrl}>Upgrade for full results</a>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : result ? (
                <ResultPanel
                  result={result}
                  reportLabel={reportLabel}
                  resumeIdForActions={activeResumeIdForActions}
                  onReset={reset}
                  buildReport={buildReport}
                />
              ) : !isRunning ? (
                <EmptyStateCard
                  icon={header.icon}
                  title={emptyState.title}
                  blurb={emptyState.blurb}
                  bullets={emptyState.bullets}
                />
              ) : null}
            </div>
          </div>
    </ToolShell>
  );
}

// ---------------------------------------------------------------------------
// Sub-components — kept in this file because they're tightly coupled to
// the page's result shape and only used here.
// ---------------------------------------------------------------------------

interface ResultPanelProps {
  result: ResumeAnalysisResult;
  reportLabel: string;
  resumeIdForActions: string | undefined;
  onReset: () => void;
  buildReport: (r: ResumeAnalysisResult) => string;
}

function ResultPanel({ result, reportLabel: _reportLabel, resumeIdForActions, onReset, buildReport }: ResultPanelProps) {
  return (
    <>
      {/* Score header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Score Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className={`text-3xl font-bold ${getScoreColor(result.overallScore)}`}>
                {result.overallScore}
              </div>
              {result.grade && (
                <div
                  className={`inline-flex items-center mt-2 px-3 py-1 rounded-full text-lg font-semibold ${getGradeColor(result.grade)}`}
                >
                  {result.grade}
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-2">Overall Score</p>
            </div>

            <CategoryBars result={result} />
          </div>
        </CardContent>
      </Card>

      {/* Strengths + weaknesses (Scorer-style) — self-gated */}
      {(result.strengths?.length || result.weaknesses?.length) ? (
        <Card>
          <CardHeader>
            <CardTitle>Analysis Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.strengths?.length ? (
              <div>
                <h4 className="font-semibold text-green-600 mb-2">Strengths</h4>
                <ul className="space-y-1">
                  {result.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-green-600 mt-1">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.weaknesses?.length ? (
              <div>
                <h4 className="font-semibold text-red-600 mb-2">Areas for Improvement</h4>
                <ul className="space-y-1">
                  {result.weaknesses.map((w, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-red-600 mt-1">•</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Recommendations + Action buttons */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {result.recommendations.map((rec, index) => {
              const severity = rec.severity ?? (rec.category as any);
              const matchHighlight = rec.matchHighlight ?? extractMatchHighlight(rec);
              return (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-semibold">{rec.title}</h4>
                    {severity && (
                      <Badge
                        variant="secondary"
                        className={getRecommendationBadgeColor(severity)}
                      >
                        {severity}
                      </Badge>
                    )}
                    {typeof rec.impact !== "undefined" && (
                      <Badge variant="outline" className="text-xs">
                        Impact: {typeof rec.impact === "number" ? `${rec.impact}/10` : rec.impact}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{rec.description}</p>
                  <RecommendationActionButton
                    recommendation={{ category: rec.category, title: rec.title, description: rec.description }}
                    resumeId={resumeIdForActions}
                    matchHighlight={matchHighlight}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 mt-6">
            <Button variant="outline" onClick={onReset}>
              Run Another
            </Button>
            <Button
              onClick={() => navigator.clipboard.writeText(buildReport(result))}
              variant="outline"
            >
              Copy Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Optimized rewrite — self-gates on presence */}
      {result.optimizedContent ? (
        <Card>
          <CardHeader>
            <CardTitle>Optimized Draft</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-3 max-h-96 overflow-y-auto">
              {result.optimizedContent}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function CategoryBars({ result }: { result: ResumeAnalysisResult }) {
  const rows: Array<{ label: string; score: number }> = [
    { label: "ATS Compatibility", score: result.atsScore },
    { label: "Content Quality", score: result.contentScore },
    { label: "Keywords", score: result.keywordScore },
    { label: "Format", score: result.formatScore },
    ...(typeof result.impactScore === "number"
      ? [{ label: "Impact", score: result.impactScore }]
      : []),
  ];
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex justify-between text-sm mb-1">
            <span>{row.label}</span>
            <span className={getScoreColor(row.score)}>{row.score}%</span>
          </div>
          <Progress value={row.score} className="h-2" />
        </div>
      ))}
    </div>
  );
}

function EmptyStateCard({
  icon,
  title,
  blurb,
  bullets,
}: {
  icon: ReactNode;
  title: string;
  blurb: string;
  bullets: string[];
}) {
  return (
    <Card>
      <CardContent className="p-8 text-center">
        <div className="mx-auto mb-4 h-12 w-12 flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
        <h3 className="font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{blurb}</p>
        <div className="text-left bg-muted rounded-lg p-4 mt-4">
          <h4 className="font-medium mb-2">What you'll get:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            {bullets.map((b, i) => (
              <li key={i}>• {b}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
