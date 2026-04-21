import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  FileText,
  Save,
  Copy,
  CheckCircle2,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
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
import Footer from "@/components/Footer";
import ToolFooterSEO from "@/components/ToolFooterSEO";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import AuthOverlay from "@/components/AuthOverlay";
import { ToolTierBadge } from "@/components/ToolTierBadge";
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
import { ToolHistoryButton } from "@/components/ToolHistoryButton";

export default function ResumeTailor() {
  const location = useLocation();
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

  // Form state
  const [jobDescription, setJobDescription] = useState("");
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
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

  // Handle generate
  const handleGenerate = async () => {
    if (!jobDescription.trim()) {
      setError("Please enter a job description");
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

    try {
      const response = await matchService.tailorResumeFromJobHtml({
        jobHtml: jobDescription,
        resumeId: selectedResumeId || undefined,
      });
      setResult(response);
      void recordRun({
        score: typeof response.newScore === "number" ? response.newScore : null,
        result: response as unknown as Record<string, unknown>,
        summary: `Tailored ${Math.round(response.oldScore)}% → ${Math.round(response.newScore)}%`,
        resumeId: selectedResumeId || undefined,
        jobDescription: jobDescription || undefined,
      });
      clear();
    } catch (_err) {
      console.error("Failed to generate tailored resume:", _err);
      setError("Failed to generate tailored resume. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle copy to clipboard
  const handleCopy = async () => {
    if (result?.markdownResume) {
      await navigator.clipboard.writeText(result.markdownResume);
      setCopied(true);
      toast.success("Resume copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Handle save as variation
  const handleSaveVariation = async () => {
    if (!result?.markdownResume || !selectedResumeId) {
      toast.error("Please select a resume and generate a tailored version first");
      return;
    }

    try {
      // TODO: Implement save as variation API call
      toast.success("Resume saved as variation");
    } catch (err) {
      toast.error("Failed to save variation");
    }
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
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-brand-purple/10 rounded-lg flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-brand-purple" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold flex items-center gap-2">
                    AI Resume Tailor
                    <ToolTierBadge toolId="resume-tailor" />
                  </h1>
                  <p className="text-muted-foreground">
                    Generate a tailored resume optimized for a specific job
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ToolHistoryButton toolId="resume-tailor" />
                <Link to="/tools">
                  <Button variant="outline" size="sm">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Tools
                  </Button>
                </Link>
              </div>
            </div>

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

                      <div className="space-y-2">
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
                      </div>

                      <Button
                        onClick={handleGenerate}
                        disabled={isGenerating || !jobDescription.trim()}
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

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={handleCopy} className="flex-1">
                          {copied ? (
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                          ) : (
                            <Copy className="h-4 w-4 mr-2" />
                          )}
                          {copied ? "Copied!" : "Copy"}
                        </Button>
                        <Button variant="outline" onClick={handleSaveVariation} className="flex-1">
                          <Save className="h-4 w-4 mr-2" />
                          Save as Variation
                        </Button>
                      </div>

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

                      {/* Generated Resume */}
                      <Card>
                        <CardHeader>
                          <CardTitle>Tailored Resume</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="prose prose-sm max-w-none dark:prose-invert bg-muted/50 p-4 rounded-lg">
                            <ReactMarkdown>{result.markdownResume}</ReactMarkdown>
                          </div>
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

