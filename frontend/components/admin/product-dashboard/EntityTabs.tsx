import { useTranslation } from "react-i18next";
import { Briefcase, Building2, FileText, Activity, TrendingUp } from "lucide-react";
import { MetricCard } from "./MetricCard";
import { GrowthChartCard } from "./GrowthChartCard";
import { CountList } from "./CountList";
import { BreakdownCard } from "./BreakdownCard";
import { GROWTH_STROKES } from "./helpers";
import type { ProductDashboardData } from "./types";

export function JobsTab({ data }: { data: ProductDashboardData }) {
  const { t } = useTranslation();
  const m = data.jobMetrics;
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title={t("admin.productDashboard.totalJobs")}
          value={m.totalJobs}
          icon={<Briefcase className="h-4 w-4" />}
          description={t("admin.productDashboard.allJobPostings")}
        />
        <MetricCard
          title={t("admin.productDashboard.activeJobs")}
          value={m.activeJobs}
          icon={<Activity className="h-4 w-4" />}
          description={t("admin.productDashboard.currentlyOpenPositions")}
        />
        <MetricCard
          title={t("admin.productDashboard.newJobs")}
          value={m.newJobsLast30Days}
          icon={<TrendingUp className="h-4 w-4" />}
          description={t("admin.productDashboard.postedLast30Days")}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 mt-6">
        <BreakdownCard
          title={t("admin.productDashboard.jobsByStatus")}
          description={t("admin.productDashboard.jobsByStatusDesc")}
        >
          <CountList counts={m.jobsByStatus} emptyText={t("admin.productDashboard.noJobStatusData")} />
        </BreakdownCard>
        <GrowthChartCard
          title={t("admin.productDashboard.jobGrowthTrend")}
          description={t("admin.productDashboard.jobGrowthTrendDesc")}
          data={data.jobGrowthLast90Days}
          stroke={GROWTH_STROKES.jobs}
        />
      </div>
    </>
  );
}

export function CompaniesTab({ data }: { data: ProductDashboardData }) {
  const { t } = useTranslation();
  const m = data.companyMetrics;
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title={t("admin.productDashboard.totalCompanies")}
          value={m.totalCompanies}
          icon={<Building2 className="h-4 w-4" />}
          description={t("admin.productDashboard.allRegisteredCompanies")}
        />
        <MetricCard
          title={t("admin.productDashboard.activeCompanies")}
          value={m.activeCompanies}
          icon={<Activity className="h-4 w-4" />}
          description={t("admin.productDashboard.activeCompaniesDesc")}
        />
        <MetricCard
          title={t("admin.productDashboard.newCompanies")}
          value={m.newCompaniesLast30Days}
          icon={<TrendingUp className="h-4 w-4" />}
          description={t("admin.productDashboard.registeredLast30Days")}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 mt-6">
        <BreakdownCard
          title={t("admin.productDashboard.companiesBySize")}
          description={t("admin.productDashboard.companiesBySizeDesc")}
        >
          <CountList counts={m.companiesBySize} emptyText={t("admin.productDashboard.noCompanySizeData")} />
        </BreakdownCard>
        <GrowthChartCard
          title={t("admin.productDashboard.companyGrowthTrend")}
          description={t("admin.productDashboard.companyGrowthTrendDesc")}
          data={data.companyGrowthLast90Days}
          stroke={GROWTH_STROKES.companies}
        />
      </div>
    </>
  );
}

export function ResumesTab({ data }: { data: ProductDashboardData }) {
  const { t } = useTranslation();
  const m = data.resumeMetrics;
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title={t("admin.productDashboard.totalResumes")}
          value={m.totalResumes}
          icon={<FileText className="h-4 w-4" />}
          description={t("admin.productDashboard.allCreatedResumes")}
        />
        <MetricCard
          title={t("admin.productDashboard.publicResumes")}
          value={m.publicResumes}
          icon={<Activity className="h-4 w-4" />}
          description={t("admin.productDashboard.publicResumesDesc")}
        />
        <MetricCard
          title={t("admin.productDashboard.newResumes")}
          value={m.newResumesLast30Days}
          icon={<TrendingUp className="h-4 w-4" />}
          description={t("admin.productDashboard.createdLast30Days")}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 mt-6">
        <BreakdownCard
          title={t("admin.productDashboard.resumesByType")}
          description={t("admin.productDashboard.resumesByTypeDesc")}
        >
          <CountList counts={m.resumesByType} />
        </BreakdownCard>
        <GrowthChartCard
          title={t("admin.productDashboard.resumeGrowthTrend")}
          description={t("admin.productDashboard.resumeGrowthTrendDesc")}
          data={data.resumeGrowthLast90Days}
          stroke={GROWTH_STROKES.resumes}
        />
      </div>
    </>
  );
}
