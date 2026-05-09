import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  CheckCircle2,
  Loader2,
  Building2,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import ToolFooterSEO from "@/components/ToolFooterSEO";
import JobInputStep from "@/components/tools/JobInputStep";
import ResumeSelectionStep from "@/components/tools/ResumeSelectionStep";
import ValuePropositionResultsStep from "@/components/tools/ValuePropositionResultsStep";
import CompanyInfoStep from "@/components/tools/CompanyInfoStep";
import AuthOverlay from "@/components/AuthOverlay";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { useAuth } from "@/lib/auth";
import {
  valuePropositionService,
  type ValuePropositionResponse,
} from "@/lib/services/value-proposition-service";
import { useToolRunRecorder } from "@/lib/tools/use-tool-run-recorder";
import { useToolEntityParams } from "@/lib/tools/use-tool-entity-params";
import {
  buildGenerateInput,
  buildRecordRunArgs,
  type CompanyData,
  type JobData,
  type ResumeData,
} from "@/lib/tools/value-proposition-payload";
import { ToolPageHeader } from "@/components/tools/ToolPageHeader";

type WizardStep = "job" | "resume" | "company" | "results";

export default function ValueProposition() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  // SEO for value proposition page
  useSEO(location.pathname);
  useBreadcrumbs([
    { name: t("labels.aiTools"), url: "/tools" },
    { name: t("tools.valueProposition.title"), url: "/tools/value-proposition" },
  ]);

  // Deep-link preselection — when the user came in from a resume, job,
  // or company action menu, seed the matching wizard step.
  const {
    resumeId: deepLinkResumeId,
    jobId: deepLinkJobId,
    companyId: _deepLinkCompanyId,
  } = useToolEntityParams();
  const initialJobData: JobData | null = deepLinkJobId
    ? { jobId: deepLinkJobId, source: "existing" }
    : null;
  const initialResumeData: ResumeData | null = deepLinkResumeId
    ? { resumeId: deepLinkResumeId, source: "existing" }
    : null;
  const initialStep: WizardStep = deepLinkJobId
    ? "resume"
    : deepLinkResumeId
    ? "job"
    : "job";

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>(initialStep);
  const [jobData, setJobData] = useState<JobData | null>(initialJobData);
  const [resumeData, setResumeData] = useState<ResumeData | null>(initialResumeData);
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [valuePropositionResult, setValuePropositionResult] =
    useState<ValuePropositionResponse | null>(null);

  // Loading and error states
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  const { recordRun } = useToolRunRecorder("value-proposition");

  // Preserve the whole wizard (job + resume + company + step cursor) so
  // an anonymous user who bounces through login lands back on the same
  // step with every field still filled in.
  const { restored, snapshot, clear } = usePendingToolInput<{
    jobData: JobData | null;
    resumeData: ResumeData | null;
    companyData: CompanyData | null;
    currentStep: WizardStep;
  }>();

  useEffect(() => {
    if (!restored || !isAuthenticated) return;
    if (restored.jobData) setJobData(restored.jobData);
    if (restored.resumeData) setResumeData(restored.resumeData);
    if (restored.companyData) setCompanyData(restored.companyData);
    if (restored.currentStep) setCurrentStep(restored.currentStep);
  }, [restored, isAuthenticated]);

  // Step navigation
  const steps = [
    { id: "job", title: t("headings.jobDetails"), icon: FileText },
    { id: "resume", title: t("labels.resume"), icon: FileText },
    { id: "company", title: t("headings.companyInfo"), icon: Building2 },
    { id: "results", title: t("headings.valueProposition"), icon: CheckCircle2 },
  ];

  const currentStepIndex = steps.findIndex((step) => step.id === currentStep);

  const handleJobSelected = (data: JobData) => {
    setJobData(data);
    setCurrentStep("resume");
    setError(null);
  };

  const handleResumeSelected = (data: ResumeData) => {
    setResumeData(data);
    setCurrentStep("company");
    setError(null);
  };

  const handleCompanyInfoSubmitted = async (data: CompanyData) => {
    setCompanyData(data);
    setError(null);

    // Soft-gate: anonymous users are bounced through login with the whole
    // wizard state preserved so they return to this same step without
    // re-entering job, resume, or company details.
    if (!isAuthenticated) {
      snapshot({
        jobData,
        resumeData,
        companyData: data,
        currentStep: "company",
      });
      setShowAuthOverlay(true);
      return;
    }

    if (!jobData || !resumeData) return;

    setIsGenerating(true);

    try {
      // Use the smart helper method that routes to the correct endpoint
      const result = await valuePropositionService.generate(
        buildGenerateInput(jobData, resumeData, data),
      );

      setValuePropositionResult(result);
      void recordRun(buildRecordRunArgs(jobData, resumeData, result));
      setCurrentStep("results");
      clear();
    } catch (err) {
      console.error("Value proposition generation failed:", err);
      const errorMessage = err instanceof Error ? err.message : t("errors.generateValuePropositionFailed");
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartOver = () => {
    setCurrentStep("job");
    setJobData(null);
    setResumeData(null);
    setCompanyData(null);
    setValuePropositionResult(null);
    setError(null);
  };

  const handleBack = () => {
    if (currentStep === "resume") setCurrentStep("job");
    else if (currentStep === "company") setCurrentStep("resume");
    else if (currentStep === "results") setCurrentStep("company");
    setError(null);
  };

  return (
    <AppShell bgClassName="bg-background">
      <div className={`p-6 ${showAuthOverlay ? "relative" : ""}`}>
        {showAuthOverlay && (
          <AuthOverlay
            contentType="tool"
            title={t("tools.valueProposition.title")}
            message={t("messages.signInToGenerateValueProp")}
          />
        )}
        <div className="max-w-4xl mx-auto">
          <ToolPageHeader
            toolId="value-proposition"
            icon={<FileText className="h-6 w-6 text-purple-600" />}
            iconBgClassName="bg-gradient-to-r from-purple-100 to-blue-100"
            title={t("tools.valueProposition.heading")}
            description={t("tools.valueProposition.subtitle")}
          />

            {/* Progress Steps */}
            <div className="mb-8">
              <div className="flex items-center justify-between">
                {steps.map((step, index) => {
                  const StepIcon = step.icon;
                  const isActive = currentStep === step.id;
                  const isCompleted = index < currentStepIndex;
                  const isAccessible = index <= currentStepIndex;

                  return (
                    <div key={step.id} className="flex items-center">
                      <div
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : isCompleted
                              ? "bg-green-100 text-green-700"
                              : isAccessible
                                ? "bg-muted text-muted-foreground"
                                : "bg-muted/50 text-muted-foreground/50"
                        }`}
                      >
                        <StepIcon className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {step.title}
                        </span>
                        {isCompleted && <CheckCircle2 className="h-4 w-4" />}
                        {isActive && isGenerating && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                      </div>
                      {index < steps.length - 1 && (
                        <ArrowRight className="h-4 w-4 mx-2 text-muted-foreground" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Step Content */}
            <Card>
              <CardContent className="p-6">
                {currentStep === "job" && (
                  <JobInputStep
                    onJobSelected={handleJobSelected}
                    isLoading={isGenerating}
                    error={error}
                  />
                )}

                {currentStep === "resume" && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-semibold">
                        {t("headings.selectYourResume")}
                      </h2>
                      <Button variant="outline" onClick={handleBack}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        {t("actions.back")}
                      </Button>
                    </div>
                    <ResumeSelectionStep
                      onResumeSelected={handleResumeSelected}
                      isLoading={isGenerating}
                      error={error}
                    />
                  </div>
                )}

                {currentStep === "company" && (
                  <CompanyInfoStep
                    onCompanyInfoSubmitted={handleCompanyInfoSubmitted}
                    isLoading={isGenerating}
                    onBack={handleBack}
                  />
                )}

                {currentStep === "results" && valuePropositionResult && (
                  <ValuePropositionResultsStep
                    valuePropositionResult={valuePropositionResult}
                    onStartOver={handleStartOver}
                    onBack={handleBack}
                    isLoading={isGenerating}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      <ToolFooterSEO />
    </AppShell>
  );
}
