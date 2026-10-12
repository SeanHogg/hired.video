import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Calculator,
  Loader2,
  DollarSign,
  TrendingUp,
  MapPin,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { ToolShell } from "@/components/tools/ToolShell";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";
import { INDUSTRIES, EDUCATION_LEVELS } from "@/lib/constants/industries";

// API response types (matching backend SalaryAnalysisResult)
interface SalaryRange {
  min: number;
  max: number;
  percentile25: number;
  percentile50: number;
  percentile75: number;
  percentile90: number;
}

interface LocationAdjustmentData {
  factor: number;
  description: string;
}

interface ExperienceImpact {
  currentLevel: string;
  salaryBoost: number;
  nextMilestone: string;
}

interface IndustryComparisonData {
  industryAverage: number;
  comparison: string;
  topPayingCompanies: string[];
}

interface SkillsPremium {
  skill: string;
  premium: number;
  demand: string;
}

interface CareerGrowth {
  nextRole: string;
  timeframe: string;
  salaryIncrease: number;
}

interface NegotiationRangeData {
  conservative: number;
  target: number;
  aggressive: number;
}

interface MarketTrends {
  trend: string;
  growthRate: string;
  outlook: string;
}

interface SalaryAnalysisResult {
  averageSalary: number;
  salaryRange: SalaryRange;
  locationAdjustment: LocationAdjustmentData;
  experienceImpact: ExperienceImpact;
  industryComparison: IndustryComparisonData;
  skillsPremium: SkillsPremium[];
  careerGrowth: CareerGrowth;
  negotiationRange: NegotiationRangeData;
  marketTrends: MarketTrends;
}

// Legacy interface for UI display (will be computed from API response)
interface SalaryData {
  baseSalary: number;
  lowRange: number;
  highRange: number;
  marketAverage: number;
  percentile25: number;
  percentile75: number;
  totalCompensation: number;
  locationAdjustment: number;
  experienceAdjustment: number;
  industryComparison: {
    industry: string;
    averageSalary: number;
    difference: number;
  }[];
  // Extended data from API
  careerGrowth?: CareerGrowth;
  negotiationRange?: NegotiationRangeData;
  marketTrends?: MarketTrends;
  skillsPremium?: SkillsPremium[];
}

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
      // Call the dedicated Salary Calculator API endpoint
      const response = await apiClient.post("/api/SalaryCalculator/analyze", {
        jobTitle: jobTitle.trim(),
        location: location_.trim(),
        yearsExperience: experience[0],
        industry: industry,
      });

      // Type the API response properly
      interface ApiErrorResponse {
        success: false;
        error: { message: string };
      }
      interface ApiSuccessResponse {
        success: true;
        data: SalaryAnalysisResult;
      }
      type ApiResponse = ApiErrorResponse | ApiSuccessResponse | SalaryAnalysisResult;

      const apiResponse = response.data as ApiResponse;

      // Check for API error response
      if ('success' in apiResponse && apiResponse.success === false && 'error' in apiResponse) {
        throw new Error(apiResponse.error.message || t("errors.salaryAnalysisFailed"));
      }

      // Get the result data — the raw shape varies between API versions so
      // we treat it as `any` and pull known fields defensively.
      const raw: any = 'data' in apiResponse && apiResponse.data
        ? apiResponse.data
        : apiResponse;

      // The API may return the "legacy" shape (averageSalary, salaryRange.percentile50, …)
      // or the current shape (medianSalary, estimatedSalary, percentiles.p25, …).
      // Normalise both into the values we need.
      const baseSalary: number =
        raw.estimatedSalary || raw.medianSalary || raw.averageSalary ||
        raw.percentiles?.p50 || raw.salaryRange?.percentile50 || 0;

      if (!baseSalary && !raw.salaryRange) {
        throw new Error(t("errors.invalidSalaryData"));
      }

      // Location adjustment can be a plain number (1 = no change) or an object { factor }
      const locationFactor: number =
        typeof raw.locationAdjustment === "number"
          ? raw.locationAdjustment
          : raw.locationAdjustment?.factor ?? 1;
      const locationAdjustmentPercent = Math.round((locationFactor - 1) * 100);

      const experienceBoost = raw.experienceImpact?.salaryBoost || 0;
      const experienceAdjustmentPercent = baseSalary > 0
        ? Math.round((experienceBoost / baseSalary) * 100)
        : experience[0] * 5;

      // Percentiles — may live in `percentiles` (p25, p50, …) or in `salaryRange`
      const p25 = raw.percentiles?.p25 ?? raw.salaryRange?.percentile25 ?? Math.round(baseSalary * 0.85);
      const p75 = raw.percentiles?.p75 ?? raw.salaryRange?.percentile75 ?? Math.round(baseSalary * 1.2);

      // Create industry comparison from API data
      const industryComparison = [
        {
          industry: "Technology",
          averageSalary: Math.round(baseSalary * 1.1),
          difference: 10,
        },
        {
          industry: "Finance",
          averageSalary: Math.round(baseSalary * 1.05),
          difference: 5,
        },
        {
          industry: "Healthcare",
          averageSalary: Math.round(baseSalary * 0.95),
          difference: -5,
        },
        {
          industry: "Education",
          averageSalary: Math.round(baseSalary * 0.8),
          difference: -20,
        },
      ];

      // If we have industry comparison data from the API, adjust values
      const industryAvg = raw.industryComparison?.industryAverage;
      if (industryAvg) {
        industryComparison.forEach((item) => {
          if (item.industry === industry) {
            item.averageSalary = industryAvg;
            item.difference = baseSalary > 0
              ? Math.round(((industryAvg - baseSalary) / baseSalary) * 100)
              : 0;
          }
        });
      }

      const salaryDataResult: SalaryData = {
        baseSalary,
        lowRange: raw.salaryRange?.min || Math.round(baseSalary * 0.8),
        highRange: raw.salaryRange?.max || Math.round(baseSalary * 1.3),
        marketAverage: baseSalary,
        percentile25: p25,
        percentile75: p75,
        totalCompensation: Math.round(baseSalary * 1.25),
        locationAdjustment: locationAdjustmentPercent,
        experienceAdjustment: experienceAdjustmentPercent,
        industryComparison,
        // Extended data (may not be present in all API versions)
        careerGrowth: raw.careerGrowth,
        negotiationRange: raw.negotiationRange,
        marketTrends: raw.marketTrends,
        skillsPremium: raw.skillsPremium,
      };

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

  const formatSalary = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
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
                  <>
                    {/* Main Salary Display */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <DollarSign className="h-5 w-5" />
                          {t("headings.aiSalaryAnalysis")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-center p-6 rounded-lg mb-4 bg-accent/50">
                          <div className="text-4xl font-bold text-brand-green mb-2">
                            {formatSalary(salaryData.baseSalary)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {t("labels.estimatedAnnualSalary")}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <div className="font-semibold">
                              {formatSalary(salaryData.lowRange)}
                            </div>
                            <div className="text-muted-foreground">
                              {t("labels.lowRange")}
                            </div>
                          </div>
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <div className="font-semibold">
                              {formatSalary(salaryData.highRange)}
                            </div>
                            <div className="text-muted-foreground">
                              {t("labels.highRange")}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Detailed Breakdown */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5" />
                          {t("headings.salaryBreakdown")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span>{t("labels.marketAverage")}</span>
                          <span className="font-semibold">
                            {formatSalary(salaryData.marketAverage)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span>{t("labels.percentile25")}</span>
                          <span className="font-semibold">
                            {formatSalary(salaryData.percentile25)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span>{t("labels.percentile75")}</span>
                          <span className="font-semibold">
                            {formatSalary(salaryData.percentile75)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center border-t pt-3">
                          <span>{t("labels.totalCompensation")}</span>
                          <span className="font-semibold text-brand-green">
                            {formatSalary(salaryData.totalCompensation)}
                          </span>
                        </div>

                        <div className="text-xs text-muted-foreground">
                          {t("messages.totalCompensationNote")}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Adjustments */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <MapPin className="h-5 w-5" />
                          {t("headings.salaryAdjustments")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {t("labels.locationAdjustment")}
                          </span>
                          <Badge
                            variant={
                              salaryData.locationAdjustment >= 0
                                ? "default"
                                : "secondary"
                            }
                          >
                            {salaryData.locationAdjustment >= 0 ? "+" : ""}
                            {salaryData.locationAdjustment}%
                          </Badge>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-2">
                            <Briefcase className="h-4 w-4" />
                            {t("labels.experienceAdjustment")}
                          </span>
                          <Badge variant="default">
                            +{salaryData.experienceAdjustment}%
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Industry Comparison */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Briefcase className="h-5 w-5" />
                          {t("headings.industryComparison")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {salaryData.industryComparison.map((comp, index) => (
                          <div
                            key={index}
                            className="flex justify-between items-center"
                          >
                            <span>{comp.industry}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">
                                {formatSalary(comp.averageSalary)}
                              </span>
                              <Badge
                                variant={
                                  comp.difference >= 0 ? "default" : "secondary"
                                }
                                className={
                                  comp.difference >= 0
                                    ? "bg-brand-green/15 text-brand-green-text"
                                    : "bg-destructive/10 text-destructive"
                                }
                              >
                                {comp.difference >= 0 ? "+" : ""}
                                {comp.difference}%
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <div className="flex gap-2">
                      <Button variant="outline" onClick={resetCalculator}>
                        {t("actions.calculateAnother")}
                      </Button>
                      <Button
                        onClick={async () => {
                          const report = t("messages.salary.reportBody", {
                            jobTitle,
                            location: location_,
                            estimated: formatSalary(salaryData.baseSalary),
                            low: formatSalary(salaryData.lowRange),
                            high: formatSalary(salaryData.highRange),
                            total: formatSalary(salaryData.totalCompensation),
                          });
                          try {
                            await navigator.clipboard.writeText(report);
                            toast.success(t("messages.salary.reportCopied"));
                          } catch {
                            toast.error(t("errors.couldNotCopyToClipboard"));
                          }
                        }}
                        variant="outline"
                      >
                        {t("actions.copyReport")}
                      </Button>
                    </div>
                  </>
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
