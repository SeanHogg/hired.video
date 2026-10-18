import { useTranslation } from "react-i18next";
import { Users, Briefcase, Building2, FileText } from "lucide-react";
import { MetricCard } from "./MetricCard";
import { GrowthChartCard } from "./GrowthChartCard";
import { GROWTH_STROKES } from "./helpers";
import type { ProductDashboardData } from "./types";

export function OverviewTab({ data }: { data: ProductDashboardData }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title={t("metrics.totalUsers")}
          value={data.userMetrics.totalUsers}
          change={t("messages.changeThisMonth", { count: data.userMetrics.newUsersLast30Days })}
          trend="up"
          icon={<Users className="h-4 w-4" />}
          description={t("messages.allRegisteredUsers")}
        />
        <MetricCard
          title={t("metrics.activeJobs")}
          value={data.jobMetrics.activeJobs}
          change={t("messages.changeThisMonth", { count: data.jobMetrics.newJobsLast30Days })}
          trend="up"
          icon={<Briefcase className="h-4 w-4" />}
          description={t("messages.currentlyOpenPositions")}
        />
        <MetricCard
          title={t("labels.companies")}
          value={data.companyMetrics.totalCompanies}
          change={t("messages.changeThisMonth", { count: data.companyMetrics.newCompaniesLast30Days })}
          trend="up"
          icon={<Building2 className="h-4 w-4" />}
          description={t("messages.allRegisteredCompanies")}
        />
        <MetricCard
          title={t("labels.resumes")}
          value={data.resumeMetrics.totalResumes}
          change={t("messages.changeThisMonth", { count: data.resumeMetrics.newResumesLast30Days })}
          trend="up"
          icon={<FileText className="h-4 w-4" />}
          description={t("messages.allCreatedResumes")}
        />
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 mt-4 sm:mt-6">
        <GrowthChartCard
          compact
          title={t("admin.productDashboard.userGrowth90Title")}
          description={t("admin.productDashboard.userGrowth90Desc")}
          data={data.userGrowthLast90Days}
          stroke={GROWTH_STROKES.users}
        />
        <GrowthChartCard
          compact
          title={t("admin.productDashboard.jobGrowth90Title")}
          description={t("admin.productDashboard.jobGrowth90Desc")}
          data={data.jobGrowthLast90Days}
          stroke={GROWTH_STROKES.jobs}
        />
      </div>
    </>
  );
}
