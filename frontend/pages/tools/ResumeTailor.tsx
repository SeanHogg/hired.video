import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Loader2,
  FileText,
  ExternalLink,
  Copy,
  CheckCircle2,
  Upload,
  Briefcase,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { renderMarkdownFromJsonResume } from "@shared/resume-markdown";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import { DEFAULT_DESCRIPTOR } from "@/types/resume-template";
import type { Resume } from "@shared/resume";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { jobService } from "@/lib/services/job-service";
import Footer from "@/components/Footer";
import ToolFooterSEO from "@/components/ToolFooterSEO";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import AuthOverlay from "@/components/AuthOverlay";
import { useSidebar } from "@/hooks/use-sidebar";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { useAuth } from "@/lib/auth";
import { resumeService } from "@/lib/services/resume-service";
import {
  matchService,
  type JobTailorResponse,
} from "@/lib/services/match-service";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useToolRunRecorder } from "@/lib/tools/use-tool-run-recorder";
import { useToolEntityParams } from "@/lib/tools/use-tool-entity-params";
import { ToolPageHeader } from "@/components/tools/ToolPageHeader";

export default function ResumeTailor() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated, user } = useAuth();

  // SEO for resume tailor page
  useSEO(location.pathname);
  useBreadcrumbs([
    { name: "Tools", url: "/tools" },
    { name: "Resume Tailor", url: "/tools/resume-tailor" },
  ]);

  // The user can supply the job three ways. Exactly one is used per
  // generate call; the active tab decides which fields we read.
  type JobSource = "paste" | "upload" | "saved";

  // Form state — preselect from deep-link params when the user landed
  // here from a resume or job action menu.
  const { resumeId: deepLinkResumeId, jobId: deepLinkJobId } = useToolEntityParams();
  const [jobSource, setJobSource] = useState<JobSource>(deepLinkJobId ? "saved" : "paste");
  const [jobDescription, setJobDescription] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string>(deepLinkJobId ?? "");
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedResumeId, setSelectedResumeId] = useState<string>(deepLinkResumeId ?? "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JobTailorResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  const { recordRun } = useToolRunRecorder("resume-tailor");

  // Preserve the job description + resume selection so anonymous users
  // who bounce through login don't have to retype or re-pick.
  const { restored, snapshot, clear } = usePendingToolInput<{
    jobDescription?: string;
    selectedResumeId?: string;
  }>();

  useEffect(() => {
    if (!restored || !isAuthenticated) return;
    if (restored.jobDescription) setJobDescription(restored.jobDescription);
    if (restored.selectedResumeId) setSelectedResumeId(restored.selectedResumeId);
  }, [restored, isAuthenticated]);

  // Fetch user's resumes
  const { data: resumes, isLoading: resumesLoading } = useQuery({
    queryKey: ["resumes", user?.id],
    queryFn: () => resumeService.getUserResumes(),
    enabled: isAuthenticated && !!user?.id,
  });

  // Fetch user's saved jobs — populates the "Select existing" tab.
  const { data: savedJobs, isLoading: savedJobsLoading } = useQuery({
    queryKey: ["saved-jobs", user?.id],
    queryFn: () => jobService.getSavedJobs(),
    enabled: isAuthenticated && !!user?.id,
  });

  // Whether the user has supplied enough input for the current source
  // to let them click Generate. Single source of truth — drives both
  // the button's disabled state and the runtime guard.
  const canGenerate = useMemo(() => {
    if (jobSource === "paste" || jobSource === "upload") return jobDescription.trim().length > 0;
    if (jobSource === "saved") return selectedJobId.trim().length > 0;
    return false;
  }, [jobSource, jobDescription, selectedJobId]);

  // Read an uploaded file's text content in the browser. Accepts
  // text/plain, text/markdown and text/html; anything else we refuse
  // rather than silently pass binary bytes to the LLM.
  const handleFileUpload = async (file: File) => {
    setError(null);
    const allowedMime = /^text\/|application\/json/;
    const allowedExt = /\.(txt|md|html?|json|jd)$/i;
    if (!allowedMime.test(file.type) && !allowedExt.test(file.name)) {
      setError("Unsupported file. Upload a .txt, .md, or .html job description.");
      return;
    }
    try {
      const text = await file.text();
      setJobDescription(text);
      setUploadedFileName(file.name);
    } catch (err) {
      console.error("[ResumeTailor] file read failed", err);
      setError("Could not read that file — try copying the contents into the Paste tab.");
    }
  };

  // Handle generate
  const handleGenerate = async () => {
    if (!canGenerate) {
      setError(
        jobSource === "saved"
          ? "Pick one of your saved jobs first."
          : "Enter a job description first.",
      );
      return;
    }

    // Soft-gate: the tailor endpoint needs an authenticated user (to pull
    // the master resume). Snapshot the job description and any resume
    // selection so the user lands back on this exact form after login.
    if (!isAuthenticated) {
      snapshot({ jobDescription, selectedResumeId });
      setShowAuthOverlay(true);
      return;
    }

    setError(null);
    setIsGenerating(true);
    setResult(null);

    // Each tab maps to exactly one identifier in the tailor request.
    const request =
      jobSource === "saved"
        ? { jobId: selectedJobId, resumeId: selectedResumeId || undefined }
        : { jobHtml: jobDescription, resumeId: selectedResumeId || undefined };

    try {
      const response = await matchService.tailorResumeFromJobHtml(request);
      setResult(response);
      void recordRun({
        score: typeof response.newScore === "number" ? response.newScore : null,
        result: response as unknown as Record<string, unknown>,
        summary: `Tailored ${Math.round(response.oldScore)}% → ${Math.round(response.newScore)}%`,
        resumeId: selectedResumeId || undefined,
        jobDescription: jobSource === "saved" ? undefined : jobDescription,
      });
      clear();
    } catch (err: any) {
      console.error("Failed to generate tailored resume:", err);
      // Surface the server's clear error code when present — the 503
      // AI_UNAVAILABLE path tells the user "retry in a minute" instead
      // of a generic failure message.
      const code = err?.context?.serverCode ?? err?.code;
      const msg = err?.context?.serverMessage ?? err?.message;
      if (code === "AI_UNAVAILABLE") {
        setError(msg || "AI providers are temporarily unavailable. Please try again in a minute.");
      } else if (code === "VALIDATION_ERROR") {
        setError(msg || "The AI output couldn't be validated. Try again.");
      } else {
        setError("Failed to generate tailored resume. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Build a minimal Resume object so `DeclarativeResumeRenderer` can
  // render the tailored JSON with the same presentation the user sees
  // on /resumes/:id. The server has already persisted the variation
  // (variationId is in the response), so we're only rendering — no
  // save-side concerns.
  const previewResume = useMemo<Resume | null>(() => {
    if (!result?.tailoredResume) return null;
    return {
      id: result.variationId,
      title: result.variationTitle,
      content: result.tailoredResume,
    } as unknown as Resume;
  }, [result]);

  // Copy to clipboard as plain markdown — useful for pasting into
  // tools that don't accept JSON resume. Rendered client-side from
  // the structured JSON so preview + clipboard never disagree.
  const handleCopy = async () => {
    if (!result?.tailoredResume) return;
    try {
      const text = renderMarkdownFromJsonResume(result.tailoredResume);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Resume copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("[ResumeTailor] clipboard copy failed", err);
      toast.error("Copy failed");
    }
  };

  const handleOpenVariation = () => {
    if (!result?.variationId) return;
    navigate(`/resumes/${result.variationId}`);
  };

  // Score color helper
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className={`pt-16 p-6 ${showAuthOverlay ? "relative" : ""}`}>
          {showAuthOverlay && (
            <AuthOverlay
              contentType="tool"
              title="AI Resume Tailor"
              message="Sign in to tailor your resume — we'll keep the job description you've pasted and generate the tailored version as soon as you're back."
            />
          )}
          <div className="max-w-7xl mx-auto space-y-8">
            <ToolPageHeader
              toolId="resume-tailor"
              icon={<Sparkles className="h-6 w-6 text-brand-purple" />}
              iconBgClassName="bg-brand-purple/10"
              title="AI Resume Tailor"
              description="Generate a tailored resume optimized for a specific job"
            />

            {(
              <div className="grid lg:grid-cols-2 gap-8">
                {/* Input Section */}
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Job Description
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="resume-select">Select Your Resume</Label>
                        {isAuthenticated ? (
                          <Select
                            value={selectedResumeId}
                            onValueChange={setSelectedResumeId}
                            disabled={resumesLoading}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a resume..." />
                            </SelectTrigger>
                            <SelectContent>
                              {resumes?.filter((resume) => resume.Id || resume.id).map((resume) => (
                                <SelectItem key={(resume.id as string | undefined)!} value={(resume.id as string | undefined)!}>
                                  {(resume.title || resume.slug || "Untitled Resume") as string}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-sm text-muted-foreground border border-dashed rounded-md p-3">
                            Paste a job below, then sign in to pick one of your saved
                            resumes — we'll keep the job description you've entered.
                          </p>
                        )}
                      </div>

                      <Tabs value={jobSource} onValueChange={(v) => setJobSource(v as JobSource)}>
                        <TabsList className="grid grid-cols-3 w-full">
                          <TabsTrigger value="paste">
                            <FileText className="h-4 w-4 mr-1.5" />
                            Paste
                          </TabsTrigger>
                          <TabsTrigger value="upload">
                            <Upload className="h-4 w-4 mr-1.5" />
                            Upload JD
                          </TabsTrigger>
                          <TabsTrigger value="saved" disabled={!isAuthenticated}>
                            <Briefcase className="h-4 w-4 mr-1.5" />
                            Saved Job
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="paste" className="space-y-2 mt-4">
                          <Label htmlFor="job-description">
                            Paste Job Description or URL
                          </Label>
                          <Textarea
                            id="job-description"
                            placeholder="Paste the job description here, or paste the job posting URL..."
                            value={jobDescription}
                            onChange={(e) => setJobDescription(e.target.value)}
                            rows={12}
                            className="resize-none"
                          />
                        </TabsContent>

                        <TabsContent value="upload" className="space-y-2 mt-4">
                          <Label>Upload a job description file</Label>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".txt,.md,.html,.htm,.json,text/plain,text/markdown,text/html,application/json"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleFileUpload(f);
                              // Reset so re-selecting the same file fires change again.
                              e.target.value = "";
                            }}
                          />
                          <div className="border border-dashed rounded-md p-6 text-center space-y-3">
                            <Upload className="h-8 w-8 mx-auto text-muted-foreground/60" />
                            <div className="text-sm text-muted-foreground">
                              Drop a <code>.txt</code>, <code>.md</code>, or <code>.html</code> file,
                              or click below to choose.
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              Choose File
                            </Button>
                            {uploadedFileName && (
                              <div className="text-xs text-green-700 dark:text-green-400">
                                Loaded: <span className="font-mono">{uploadedFileName}</span>
                              </div>
                            )}
                          </div>
                          {jobDescription && (
                            <Textarea
                              value={jobDescription}
                              onChange={(e) => setJobDescription(e.target.value)}
                              rows={6}
                              className="resize-none text-xs font-mono mt-2"
                            />
                          )}
                        </TabsContent>

                        <TabsContent value="saved" className="space-y-2 mt-4">
                          <Label htmlFor="saved-job-select">Pick a tracked job</Label>
                          {isAuthenticated ? (
                            <Select
                              value={selectedJobId}
                              onValueChange={setSelectedJobId}
                              disabled={savedJobsLoading}
                            >
                              <SelectTrigger id="saved-job-select">
                                <SelectValue
                                  placeholder={
                                    savedJobsLoading
                                      ? "Loading your jobs..."
                                      : savedJobs && savedJobs.length > 0
                                        ? "Select a saved job..."
                                        : "No saved jobs yet — track a job first"
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {savedJobs?.map((job) => (
                                  <SelectItem key={job.id} value={job.id}>
                                    {job.title}
                                    {job.company ? ` — ${job.company}` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <p className="text-sm text-muted-foreground border border-dashed rounded-md p-3">
                              Sign in to pick from jobs you've tracked.
                            </p>
                          )}
                        </TabsContent>
                      </Tabs>

                      <Button
                        onClick={handleGenerate}
                        disabled={isGenerating || !canGenerate}
                        className="w-full"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            Generate Tailored Resume
                          </>
                        )}
                      </Button>

                      {error && (
                        <Alert variant="destructive">
                          <AlertDescription>{error}</AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Results Section */}
                <div className="space-y-6">
                  {result ? (
                    <>
                      {/* Score Card */}
                      <Card>
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between">
                            <div className="text-center">
                              <p className="text-sm text-muted-foreground">Original Score</p>
                              <p className={`text-3xl font-bold ${getScoreColor(result.oldScore)}`}>
                                {Math.round(result.oldScore)}%
                              </p>
                            </div>
                            <div className="text-4xl">→</div>
                            <div className="text-center">
                              <p className="text-sm text-muted-foreground">New Score</p>
                              <p className={`text-3xl font-bold ${getScoreColor(result.newScore)}`}>
                                {Math.round(result.newScore)}%
                              </p>
                            </div>
                            <div className="text-center">
                              <p className="text-sm text-muted-foreground">Improvement</p>
                              <p className="text-3xl font-bold text-green-600">
                                +{Math.round(result.newScore - result.oldScore)}%
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Actions — the variation is already saved by
                          the server during the tailor call, so the
                          primary action is to open it. */}
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={handleCopy} className="flex-1">
                          {copied ? (
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                          ) : (
                            <Copy className="h-4 w-4 mr-2" />
                          )}
                          {copied ? "Copied!" : "Copy as Markdown"}
                        </Button>
                        <Button
                          onClick={handleOpenVariation}
                          className="flex-1"
                          disabled={!result.variationId}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open Variation
                        </Button>
                      </div>

                      {/* Changes list — populated only when the JSON path ran */}
                      {result.changes && result.changes.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle>Changes ({result.changes.length})</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ul className="space-y-3">
                              {result.changes.map((change, idx) => (
                                <li
                                  key={idx}
                                  className="border rounded-md p-3 text-sm"
                                >
                                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                                    {change.section}
                                  </div>
                                  <div className="grid sm:grid-cols-2 gap-2 mb-2">
                                    <div className="bg-red-500/10 p-2 rounded">
                                      <div className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">
                                        Before
                                      </div>
                                      <div className="whitespace-pre-wrap break-words">
                                        {change.before || <em>empty</em>}
                                      </div>
                                    </div>
                                    <div className="bg-green-500/10 p-2 rounded">
                                      <div className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">
                                        After
                                      </div>
                                      <div className="whitespace-pre-wrap break-words">
                                        {change.after || <em>empty</em>}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-muted-foreground">
                                    <span className="font-semibold">Why:</span> {change.why}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      )}

                      {/* Recommendations */}
                      {result.summaryRecommendations && (
                        <Card>
                          <CardHeader>
                            <CardTitle>Recommendations</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="prose prose-sm max-w-none dark:prose-invert">
                              <ReactMarkdown>{result.summaryRecommendations}</ReactMarkdown>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Generated Resume — rendered from the structured
                          JSON via the same component that powers
                          /resumes/:id so the preview matches the saved
                          variation exactly. */}
                      <Card>
                        <CardHeader>
                          <CardTitle>Tailored Resume</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {previewResume && (
                            <DeclarativeResumeRenderer
                              resume={previewResume}
                              descriptor={DEFAULT_DESCRIPTOR}
                            />
                          )}
                        </CardContent>
                      </Card>
                    </>
                  ) : (
                    <Card>
                      <CardContent className="p-12 text-center">
                        <Sparkles className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-semibold mb-2">
                          Your Tailored Resume Will Appear Here
                        </h3>
                        <p className="text-muted-foreground">
                          Paste a job description and click "Generate" to create a
                          resume optimized for that specific position.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <ToolFooterSEO />
        <Footer />
      </div>
    </div>
  );
}

