/**
 * Salary Calculator data — the `salary-analyze` AI tool's reply normalised
 * into the values the /tools/salary-calculator page shows. The reply comes
 * in a "legacy" shape (averageSalary, salaryRange.percentile50, …) or the
 * current one (medianSalary, estimatedSalary, percentiles.p25, …); both
 * land on one `SalaryData`.
 */
import type { ApiSuccessResponse } from "@shared/api";

interface SalaryRange {
  min: number;
  max: number;
  percentile25: number;
  percentile50: number;
  percentile75: number;
  percentile90: number;
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

// API response type (matching backend SalaryAnalysisResult)
export interface SalaryAnalysisResult {
  averageSalary: number;
  salaryRange: SalaryRange;
  locationAdjustment: { factor: number; description: string };
  experienceImpact: { currentLevel: string; salaryBoost: number; nextMilestone: string };
  industryComparison: { industryAverage: number; comparison: string; topPayingCompanies: string[] };
  skillsPremium: SkillsPremium[];
  careerGrowth: CareerGrowth;
  negotiationRange: NegotiationRangeData;
  marketTrends: MarketTrends;
}

/** What the page renders (computed from the API response). */
export interface SalaryData {
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

export function formatSalary(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Normalise a `salary-analyze` reply. `industry` is the one the person
 * picked; `years` their experience. Returns null when the reply carries no
 * usable salary at all.
 */
export function toSalaryData(
  data: SalaryAnalysisResult | ApiSuccessResponse<SalaryAnalysisResult>,
  industry: string,
  years: number,
): SalaryData | null {
  // apiClient unwraps the shared ApiResponse envelope (@shared/api) and
  // throws on `success: false`; older API versions nest the result once
  // more under `data`. The raw shape varies between API versions so we
  // pull known fields defensively.
  const raw: any = "data" in data && data.data ? data.data : data;

  const baseSalary: number =
    raw.estimatedSalary || raw.medianSalary || raw.averageSalary ||
    raw.percentiles?.p50 || raw.salaryRange?.percentile50 || 0;
  if (!baseSalary && !raw.salaryRange) return null;

  // Location adjustment can be a plain number (1 = no change) or an object { factor }
  const locationFactor: number =
    typeof raw.locationAdjustment === "number" ? raw.locationAdjustment : raw.locationAdjustment?.factor ?? 1;
  const locationAdjustmentPercent = Math.round((locationFactor - 1) * 100);

  const experienceBoost = raw.experienceImpact?.salaryBoost || 0;
  const experienceAdjustmentPercent = baseSalary > 0 ? Math.round((experienceBoost / baseSalary) * 100) : years * 5;

  // Percentiles — may live in `percentiles` (p25, p50, …) or in `salaryRange`
  const p25 = raw.percentiles?.p25 ?? raw.salaryRange?.percentile25 ?? Math.round(baseSalary * 0.85);
  const p75 = raw.percentiles?.p75 ?? raw.salaryRange?.percentile75 ?? Math.round(baseSalary * 1.2);

  const industryComparison = [
    { industry: "Technology", averageSalary: Math.round(baseSalary * 1.1), difference: 10 },
    { industry: "Finance", averageSalary: Math.round(baseSalary * 1.05), difference: 5 },
    { industry: "Healthcare", averageSalary: Math.round(baseSalary * 0.95), difference: -5 },
    { industry: "Education", averageSalary: Math.round(baseSalary * 0.8), difference: -20 },
  ];

  // If we have industry comparison data from the API, adjust values
  const industryAvg = raw.industryComparison?.industryAverage;
  if (industryAvg) {
    industryComparison.forEach((item) => {
      if (item.industry === industry) {
        item.averageSalary = industryAvg;
        item.difference = baseSalary > 0 ? Math.round(((industryAvg - baseSalary) / baseSalary) * 100) : 0;
      }
    });
  }

  return {
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
}
