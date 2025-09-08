import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  CheckCircle2,
  Loader2,
  Building2,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useSEO } from "@/lib/seo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import JobInputStep from "@/components/tools/JobInputStep";
import ResumeSelectionStep from "@/components/tools/ResumeSelectionStep";
import ValuePropositionResultsStep from "@/components/tools/ValuePropositionResultsStep";
import CompanyInfoStep from "@/components/tools/CompanyInfoStep";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import {
  valuePropositionService,
  type ValuePropositionResponse,
} from "@/lib/services/value-proposition-service";

type WizardStep = "job" | "resume" | "company" | "results";

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

interface CompanyData {
  name?: string;
  mission?: string;
  values?: string;
}

export default function ValueProposition() {
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated } = useAuth();

  // SEO for value proposition page
  useSEO(location.pathname);

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>("job");
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [valuePropositionResult, setValuePropositionResult] =
    useState<ValuePropositionResponse | null>(null);

  // Loading and error states
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step navigation
  const steps = [
    { id: "job", title: "Job Details", icon: FileText },
    { id: "resume", title: "Resume", icon: FileText },
    { id: "company", title: "Company Info", icon: Building2 },
    { id: "results", title: "Value Proposition", icon: CheckCircle2 },
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
    setIsGenerating(true);

    try {
      // Call the value proposition service with the collected data
      const result = await valuePropositionService.generateByContent({
        jobContent: jobData?.jobContent,
        resumeContent: resumeData?.resumeContent,
        companyName: data.name,
        companyMission: data.mission,
        companyValues: data.values,
      });

      setValuePropositionResult(result);
      setCurrentStep("results");
    } catch (err) {
      console.error("Value proposition generation failed:", err);
      setError("Failed to generate value proposition. Please try again.");
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
    <>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div
        className={`min-h-screen bg-background ${sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}`}
      >
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16 p-6">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-4 mb-4">
                <Link to="/tools">
                  <Button variant="ghost" size="sm">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Tools
                  </Button>
                </Link>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-r from-purple-100 to-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">
                    Value Proposition Generator
                  </h1>
                  <p className="text-muted-foreground">
                    Create compelling value proposition letters that highlight
                    your unique value
                  </p>
                </div>
              </div>
            </div>

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
                        Select Your Resume
                      </h2>
                      <Button variant="outline" onClick={handleBack}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
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
      </div>
      <Footer />
    </>
  );
}
