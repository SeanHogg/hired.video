import { useTranslation } from "react-i18next";
import { DollarSign } from "lucide-react";
import type { AffiliateAdminStats } from "@/lib/services/affiliate-service";
import { BreakdownCard } from "./BreakdownCard";
import { centsToDollars, payoutStatusClass } from "./helpers";

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      {text}
    </div>
  );
}

export function AffiliateTopPerformers({ performers }: { performers: AffiliateAdminStats["topPerformers"] | undefined }) {
  const { t } = useTranslation();
  return (
    <BreakdownCard
      title={t("admin.productDashboard.affiliates.topPerformersTitle")}
      description={t("admin.productDashboard.affiliates.topPerformersDesc")}
    >
      <div className="space-y-4">
        {performers?.length ? (
          performers.map((affiliate, index) => (
            <div key={affiliate.userId} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium">#{index + 1}</span>
                </div>
                <div>
                  <p className="font-medium">{affiliate.userName}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.productDashboard.affiliates.referralsAndConversions", {
                      referrals: affiliate.totalReferrals,
                      conversions: affiliate.totalConversions,
                    })}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-medium">${centsToDollars(affiliate.totalCommissionCents)}</p>
                <p className="text-sm text-muted-foreground">
                  {t("admin.productDashboard.affiliates.conversionPercent", {
                    rate: affiliate.totalConversions > 0 ?
                      ((affiliate.totalConversions / affiliate.totalReferrals) * 100).toFixed(1) :
                      '0',
                  })}
                </p>
              </div>
            </div>
          ))
        ) : (
          <EmptyRow text={t("admin.productDashboard.affiliates.noAffiliateData")} />
        )}
      </div>
    </BreakdownCard>
  );
}

export function AffiliateRecentPayouts({ payouts }: { payouts: AffiliateAdminStats["recentPayouts"] | undefined }) {
  const { t } = useTranslation();
  return (
    <BreakdownCard
      title={t("admin.productDashboard.affiliates.recentPayoutsTitle")}
      description={t("admin.productDashboard.affiliates.recentPayoutsDesc")}
    >
      <div className="space-y-4">
        {payouts?.length ? (
          payouts.map((payout) => (
            <div key={payout.payoutId} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="font-medium">{payout.affiliateUserName}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(payout.requestedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-medium">${centsToDollars(payout.amountCents)}</p>
                <p className={`text-sm ${payoutStatusClass(payout.status)}`}>
                  {payout.status}
                </p>
              </div>
            </div>
          ))
        ) : (
          <EmptyRow text={t("admin.productDashboard.affiliates.noRecentPayouts")} />
        )}
      </div>
    </BreakdownCard>
  );
}
