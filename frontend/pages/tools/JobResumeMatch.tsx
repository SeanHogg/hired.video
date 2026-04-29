import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Target,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Footer from "@/components/Footer";
import ToolFooterSEO from "@/components/ToolFooterSEO";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import JobInputStep from "@/components/tools/JobInputStep";
import ResumeSelectionStep from "@/components/tools/ResumeSelectionStep";
import MatchResultsStep from "@/components/tools/MatchResultsStep";
import AuthOverlay from "@/components/AuthOverlay";
import { ToolTierBadge } from "@/components/ToolTierBadge";
import { useSidebar } from "@/hooks/use-sidebar";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { useAuth } from "@/lib/auth";
import {
  matchService,
  type JobResumeMatchResponse,
} from "@/lib/services/match-service";
import { useToolRunRecorder } from "@/lib/tools/use-tool-run-recorder";
import { useToolEntityParams } from "@/lib/tools/use-tool-entity-params";
import { ToolHistoryButton } from "@/components/ToolHistoryButton";

type WizardStep = "job" | "resume" | "results";

interface JobData {
  jobId?: string;
  jobContent?: string;
  source: "url" | "paste" | "file" | "existing";
}

interface ResumeData {
  resumeId?: string;
  resumeContent?: string;
  source: "existing" | "paste" | "file";
}

export default function JobResumeMatch() {
  const { t } = useTranslation();
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated } = useAuth();

  // SEO for job resume match page
  useSEO(location.pathname);
  useBreadcrumbs([
    { name: t("labels.aiTools"), url: "/tools" },
    { name: t("tools.jobResumeMatch.title"), url: "/tools/job-resume-match" },
  ]);

  // Deep-link preselection: when the user came in from a resume or job
  // action menu, skip ahead in the wizard so they land on the step that
  // still needs input. Resume-anchored deep-links open at the "job"
  // step (the resume is already known); job-anchored deep-links jump
  // straight to the "resume" step.
  const { resumeId: deepLinkResumeId, jobId: deepLinkJobId } = useToolEntityParams();
  const initialJobData: JobData | null = deepLinkJobId
    ? { jobId: deepLinkJobId, source: "existing" }
    : null;
  const initialResumeData: ResumeData | null = deepLinkResumeId
    ? { resumeId: deepLinkResumeId, source: "existing" }
    : null;
  const initialStep: WizardStep = deepLinkJobId ? "resume" : "job";

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>(initialStep);
  const [jobData, setJobData] = useState<JobData | null>(initialJobData);
  const [resumeData, setResumeData] = useState<ResumeData | null>(initialResumeData);
  const [matchResult, setMatchResult] = useState<JobResumeMatchResponse | null>(
    null,
  );

  // Loading and error states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  const { recordRun } = useToolRunRecorder("job-resume-match");

  // Preserve the wizard so anonymous users who bounce through login
  // return to the same step with job + resume still populated.
  const { restored, snapshot, clear } = usePendingToolInput<{
    jobData: JobData | null;
    resumeData: ResumeData | null;
    currentStep: WizardStep;
  }>();

  useEffect(() => {
    if (!restored || !isAuthenticated) return;
    if (restored.jobData) setJobData(restored.jobData);
    if (restored.resumeData) setResumeData(restored.resumeData);
    if (restored.currentStep) setCurrentStep(restored.currentStep);
  }, [restored, isAuthenticated]);

  // Step navigation
  const steps = [
    {
      id: "job",
      title: t("headings.selectJob"),
      description: t("messages.selectJobDesc"),
    },
    {
      id: "resume",
      title: t("headings.selectResume"),
      description: t("messages.selectResumeDesc"),
    },
    {
      id: "results",
      title: t("headings.matchResults"),
      description: t("messages.matchResultsDesc"),
    },
  ];

  const currentStepIndex = steps.findIndex((step) => step.id === currentStep);

  // Handlers
  const handleJobSelected = (data: JobData) => {
    setJobData(data);
    setError(null);
    setCurrentStep("resume");
  };

  const handleResumeSelected = async (data: ResumeData) => {
    setResumeData(data);
    setError(null);

    // Soft-gate before the paid API call. Snapshot the whole wizard so
    // the user returns to this exact step with job + resume populated.
    if (!isAuthenticated) {
      snapshot({
        jobData,
        resumeData: data,
        currentStep: "resume",
      });
      setShowAuthOverlay(true);
      return;
    }

    setIsAnalyzing(true);

    try {
      // Call the match service with the collected data
      const result = await matchService.matchJobWithResume({
        jobId: jobData?.jobId,
        jobContent: jobData?.jobContent,
        resumeId: data.resumeId,
        resumeContent: data.resumeContent,
      });

      setMatchResult(result);
      void recordRun({
        score: typeof result.score === "number" ? result.score : null,
        result: result as unknown as Record<string, unknown>,
        summary: `Match score ${Math.round(result.score)}%`,
        resumeId: data.resumeId,
        jobId: jobData?.jobId,
        jobDescription: jobData?.jobContent || undefined,
      });
      setCurrentStep("results");
      clear();
    } catch (err) {
      console.error("Match analysis failed:", err);
      setError(t("errors.analyzeJobResumeMatchFailed"));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStartOver = () => {
    setCurrentStep("job");
    setJobData(null);
    setResumeData(null);
    setMatchResult(null);
    setError(null);
  };

  const handleBackStep = () => {
    if (currentStep === "resume") {
      setCurrentStep("job");
      setResumeData(null);
    } else if (currentStep === "results") {
      setCurrentStep("resume");
      setMatchResult(null);
    }
    setError(null);
  };

  const canGoBack = currentStep !== "job" && currentStep !== "results";

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
              title={t("tools.jobResumeMatch.title")}
              message={t("messages.signInToScoreMatch")}
            />
          )}
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-brand-purple/10 rounded-lg flex items-center justify-center">
                  <Target className="h-6 w-6 text-brand-purple" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold flex items-center gap-2">
                    {t("tools.jobResumeMatch.heading")}
                    <ToolTierBadge toolId="job-resume-match" />
                  </h1>
                  <p className="text-muted-foreground">
                    {t("tools.jobResumeMatch.subtitle")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ToolHistoryButton toolId="job-resume-match" />
                <Link to="/tools">
                  <Button variant="outline" size="sm">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t("actions.backToTools")}
                  </Button>
                </Link>
              </div>
            </div>

            {/* Progress Steps */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  {steps.map((step, index) => (
                    <div key={step.id} className="flex items-center">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                            index < currentStepIndex
                              ? "bg-primary border-primary text-primary-foreground"
                              : index === currentStepIndex
                                ? "border-primary text-primary"
                                : "border-muted-foreground text-muted-foreground"
                          }`}
                        >
                          {index < currentStepIndex ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : (
                            <span className="text-sm font-medium">
                              {index + 1}
                            </span>
                          )}
                        </div>
                        <div className="hidden sm:block">
                          <div
                            className={`font-medium ${
                              index <= currentStepIndex
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {step.title}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {step.description}
                          </div>
                        </div>
                      </div>
                      {index < steps.length - 1 && (
                        <div
                          className={`w-12 h-0.5 mx-4 ${
                            index < currentStepIndex ? "bg-primary" : "bg-muted"
                          }`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Step Content */}
            <div className="space-y-6">
              {currentStep === "job" && (
                <JobInputStep
                  onJobSelected={handleJobSelected}
                  isLoading={isAnalyzing}
                  error={error}
                />
              )}

              {currentStep === "resume" && (
                <ResumeSelectionStep
                  onResumeSelected={handleResumeSelected}
                  isLoading={isAnalyzing}
                  error={error}
                />
              )}

              {currentStep === "results" && matchResult && (
                <MatchResultsStep
                  matchResult={matchResult}
                  onStartOver={handleStartOver}
                  isLoading={isAnalyzing}
                />
              )}

              {/* Loading State */}
              {isAnalyzing && (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Loader2 className="h-16 w-16 mx-auto text-primary animate-spin mb-4" />
                    <h3 className="text-lg font-semibold mb-2">
                      {t("status.analyzingMatch")}
                    </h3>
                    <p className="text-muted-foreground">
                      {t("messages.analyzingMatchBody")}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Navigation Buttons */}
              {canGoBack && !isAnalyzing && (
                <div className="flex justify-between">
                  <Button variant="outline" onClick={handleBackStep}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    {t("actions.back")}
                  </Button>
                </div>
              )}

              {/* Error Display */}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </div>
        <ToolFooterSEO />
        <Footer />
      </div>
    </div>
  );
}
