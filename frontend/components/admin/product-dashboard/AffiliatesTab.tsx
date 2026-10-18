import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import {
  Users,
  UserPlus,
  Share2,
  TrendingUp,
  CreditCard,
  Banknote,
  DollarSign,
  Clock,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AffiliateAdminStats } from "@/lib/services/affiliate-service";
import { BreakdownCard } from "./BreakdownCard";
import { AffiliateTopPerformers, AffiliateRecentPayouts } from "./AffiliateLists";
import { centsToDollars } from "./helpers";

function AffiliateStatCard({ title, icon: Icon, value, caption }: {
  title: string;
  icon: LucideIcon;
  value: ReactNode;
  caption: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {value}
        </div>
        <p className="text-xs text-muted-foreground">
          {caption}
        </p>
      </CardContent>
    </Card>
  );
}

interface AffiliatesTabProps {
  stats: AffiliateAdminStats | null;
  onManageAffiliates: () => void;
  onProcessPayouts: () => void;
}

export function AffiliatesTab({ stats, onManageAffiliates, onProcessPayouts }: AffiliatesTabProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Overview Metrics */}
        <AffiliateStatCard
          title={t("admin.productDashboard.affiliates.totalAffiliates")}
          icon={Users}
          value={stats?.totalAffiliates || 0}
          caption={t("admin.productDashboard.affiliates.activeCount", { count: stats?.activeAffiliates || 0 })}
        />
        <AffiliateStatCard
          title={t("admin.productDashboard.affiliates.newThisMonth")}
          icon={UserPlus}
          value={stats?.newAffiliatesThisMonth || 0}
          caption={t("admin.productDashboard.affiliates.newAffiliates")}
        />
        <AffiliateStatCard
          title={t("admin.productDashboard.affiliates.totalReferrals")}
          icon={Share2}
          value={stats?.totalReferrals || 0}
          caption={t("admin.productDashboard.affiliates.conversionsCount", { count: stats?.totalConversions || 0 })}
        />
        <AffiliateStatCard
          title={t("admin.productDashboard.affiliates.conversionRate")}
          icon={TrendingUp}
          value={<>{stats?.conversionRate?.toFixed(1) || 0}%</>}
          caption={t("admin.productDashboard.affiliates.overallConversion")}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Payout Metrics */}
        <AffiliateStatCard
          title={t("admin.productDashboard.affiliates.pendingPayouts")}
          icon={CreditCard}
          value={<>${centsToDollars(stats?.pendingPayoutsCents || 0)}</>}
          caption={t("admin.productDashboard.affiliates.requestsCount", { count: stats?.pendingPayouts || 0 })}
        />
        <AffiliateStatCard
          title={t("admin.productDashboard.affiliates.totalPaid")}
          icon={Banknote}
          value={<>${centsToDollars(stats?.totalCommissionsPaidCents || 0)}</>}
          caption={t("admin.productDashboard.affiliates.completedCount", { count: stats?.completedPayouts || 0 })}
        />
        <AffiliateStatCard
          title={t("admin.productDashboard.affiliates.avgCommission")}
          icon={DollarSign}
          value={
            <>
              ${stats?.completedPayouts ?
                centsToDollars(stats.totalCommissionsPaidCents / stats.completedPayouts) :
                '0.00'
              }
            </>
          }
          caption={t("admin.productDashboard.affiliates.perPayout")}
        />
        <AffiliateStatCard
          title={t("admin.productDashboard.affiliates.processing")}
          icon={Clock}
          value={(stats?.pendingPayouts || 0) + (stats?.completedPayouts || 0)}
          caption={t("admin.productDashboard.affiliates.totalPayouts")}
        />
      </div>

      <AffiliateTopPerformers performers={stats?.topPerformers} />
      <AffiliateRecentPayouts payouts={stats?.recentPayouts} />

      {/* Affiliate Management Actions */}
      <BreakdownCard title={t("admin.productDashboard.affiliates.managementTitle")} description={t("admin.productDashboard.affiliates.managementDesc")}>
        <div className="grid gap-4 md:grid-cols-3">
          <Button
            variant="outline"
            className="h-20 flex flex-col items-center justify-center space-y-2"
            onClick={onManageAffiliates}
          >
            <Users className="h-6 w-6" />
            <span>{t("admin.productDashboard.affiliates.manageAffiliates")}</span>
          </Button>
          <Button
            variant="outline"
            className="h-20 flex flex-col items-center justify-center space-y-2"
            onClick={onProcessPayouts}
          >
            <CreditCard className="h-6 w-6" />
            <span>{t("admin.productDashboard.affiliates.processPayouts")}</span>
          </Button>
          <Button variant="outline" className="h-20 flex flex-col items-center justify-center space-y-2">
            <RotateCcw className="h-6 w-6" />
            <span>{t("admin.productDashboard.affiliates.refundManagement")}</span>
          </Button>
        </div>
      </BreakdownCard>
    </>
  );
}
