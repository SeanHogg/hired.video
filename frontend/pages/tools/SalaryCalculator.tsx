import { useEffect, useState } from "react";
import type { ApiSuccessResponse } from "@shared/api";
import { useTranslation } from "react-i18next";
import { Calculator, Loader2, DollarSign } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToolShell } from "@/components/tools/ToolShell";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";
import { aiToolPath } from "@shared/ai-tools/tool-ids";
import { INDUSTRIES, EDUCATION_LEVELS } from "@/lib/constants/industries";
import { SalaryResults } from "@/components/tools/salary/SalaryResults";
import { toSalaryData, type SalaryAnalysisResult, type SalaryData } from "@/components/tools/salary/salary-data";

export default function SalaryCalculator() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  const [jobTitle, setJobTitle] = useState("");
  const [location_, setLocation] = useState("");
  const [experience, setExperience] = useState([3]);
  const [education, setEducation] = useState("");
  const [industry, setIndustry] = useState("");
  const [company, setCompany] = useState("");
  const [salaryData, setSalaryData] = useState<SalaryData | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  // Persist form inputs across the anonymous → authenticated bounce so the
  // user doesn't have to re-enter their job details after signing in.
  const { restored, snapshot, clear } = usePendingToolInput<{
    jobTitle?: string;
    location?: string;
    experience?: number[];
    industry?: string;
  }>();

  useEffect(() => {
    if (!restored || !isAuthenticated) return;
    if (restored.jobTitle) setJobTitle(restored.jobTitle);
    if (restored.location) setLocation(restored.location);
    if (restored.experience) setExperience(restored.experience);
    if (restored.industry) setIndustry(restored.industry);
  }, [restored, isAuthenticated]);

  const calculateSalary = async () => {
    if (!jobTitle.trim() || !location_.trim()) {
      setError(t("errors.enterJobTitleAndLocation"));
      return;
    }

    if (!industry) {
      setError(t("errors.selectIndustry"));
      return;
    }

    // Check authentication before proceeding
    if (!isAuthenticated) {
      snapshot({
        jobTitle,
        location: location_,
        experience,
        industry,
      });
      setShowAuthOverlay(true);
      return;
    }

    setIsCalculating(true);
    setError(null);
    setSalaryData(null);

    try {
      // The salary-analyze AI tool
      const response = await apiClient.post(aiToolPath("salary-analyze"), {
        jobTitle: jobTitle.trim(),
        location: location_.trim(),
        yearsExperience: experience[0],
        industry: industry,
      });

      const salaryDataResult = toSalaryData(
        response.data as SalaryAnalysisResult | ApiSuccessResponse<SalaryAnalysisResult>,
        industry,
        experience[0],
      );
      if (!salaryDataResult) throw new Error(t("errors.invalidSalaryData"));

      setSalaryData(salaryDataResult);
      clear();
    } catch (err: unknown) {
      console.error("Salary calculation failed:", err);
      const errorMessage = err instanceof Error ? err.message : t("errors.calculateSalaryFailed");
      setError(errorMessage);
    } finally {
      setIsCalculating(false);
    }
  };

  const resetCalculator = () => {
    setJobTitle("");
    setLocation("");
    setExperience([3]);
    setEducation("");
    setIndustry("");
    setCompany("");
    setSalaryData(null);
    setError(null);
  };

  return (
    <ToolShell
      toolId="salary-calculator"
      header={{
        icon: <Calculator className="h-6 w-6" />,
        title: t("tools.salaryCalculator.heading"),
        description: t("tools.salaryCalculator.subtitle"),
      }}
      authOverlay={{
        show: showAuthOverlay,
        title: t("tools.salaryCalculator.title"),
        message: t("messages.signInToRunToolKeepInputs"),
      }}
    >

            <div className="mb-8">
              {/* Info Card */}
              <Card className="bg-accent border-primary/30">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <DollarSign className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-accent-foreground mb-1">
                        {t("headings.aiPoweredAnalysis")}
                      </h3>
                      <p className="text-sm text-accent-foreground">
                        {t("messages.salaryAiAnalysisDesc")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column - Calculator Form */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calculator className="h-5 w-5" />
                      {t("headings.calculateYourSalary")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        {t("fields.jobTitle.label")} *
                      </label>
                      <Input
                        placeholder={t("fields.jobTitle.placeholderExample")}
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        {t("fields.location.label")} *
                      </label>
                      <Input
                        placeholder={t("fields.location.placeholderExample")}
                        value={location_}
                        onChange={(e) => setLocation(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        {t("labels.salary.yearsOfExperience", { count: experience[0] })}
                      </label>
                      <Slider
                        value={experience}
                        onValueChange={setExperience}
                        max={20}
                        min={0}
                        step={1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>{t("labels.zeroYears")}</span>
                        <span>{t("labels.twentyPlusYears")}</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        {t("fields.educationLevel.label")}
                      </label>
                      <Select value={education} onValueChange={setEducation}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("fields.educationLevel.placeholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {EDUCATION_LEVELS.map((level) => (
                            <SelectItem key={level} value={level}>
                              {level}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        {t("fields.industry.label")}
                      </label>
                      <Select value={industry} onValueChange={setIndustry}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("fields.industry.placeholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {INDUSTRIES.map((ind) => (
                            <SelectItem key={ind} value={ind}>
                              {ind}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        {t("fields.companyOptional.label")}
                      </label>
                      <Input
                        placeholder={t("fields.companyOptional.placeholder")}
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                      />
                    </div>

                    <Button
                      onClick={calculateSalary}
                      disabled={
                        isCalculating || !jobTitle.trim() || !location_.trim()
                      }
                      className="w-full"
                      size="lg"
                    >
                      {isCalculating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t("status.aiAnalyzing")}
                        </>
                      ) : (
                        <>
                          <Calculator className="h-4 w-4 mr-2" />
                          {t("actions.getAiSalaryAnalysis")}
                        </>
                      )}
                    </Button>

                    {error && (
                      <Alert>
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Results */}
              <div className="space-y-6">
                {salaryData && (
                  <SalaryResults salaryData={salaryData} jobTitle={jobTitle} location={location_} onReset={resetCalculator} />
                )}

                {!salaryData && !isCalculating && (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Calculator className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-semibold mb-2">{t("headings.readyToCalculate")}</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        {t("messages.readyToCalculateBody")}
                      </p>

                      <div className="text-left bg-muted rounded-lg p-4 mt-4">
                        <h4 className="font-medium mb-2">{t("headings.whatYoullGet")}</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          <li>• {t("labels.salary.benefitSalaryRange")}</li>
                          <li>• {t("labels.salary.benefitLocationAdjustments")}</li>
                          <li>• {t("labels.salary.benefitIndustryComparisons")}</li>
                          <li>• {t("labels.salary.benefitExperienceImpact")}</li>
                          <li>• {t("labels.salary.benefitTotalComp")}</li>
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* AI Disclaimer */}
            {salaryData && (
              <div className="mt-8">
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertDescription className="text-amber-800">
                    <strong>{t("labels.salary.aiDisclaimerLabel")}</strong>{" "}
                    {t("messages.salary.aiDisclaimerBody")}
                  </AlertDescription>
                </Alert>
              </div>
            )}
    </ToolShell>
  );
}
