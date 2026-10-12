// Settings → Billing / Usage: the viewer's AI-token balance for the month,
// with the next step — Pro buys a top-up pack, Free upgrades to Pro.
// Self-gating: nothing for signed-out or guest viewers.

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Crown, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { formatTokens, useTokenBudget } from "@/hooks/use-token-budget";
import { TokenBalanceSummary } from "@/components/billing/TokenBalanceSummary";
import { BuyTokensButton } from "@/components/billing/BuyTokensButton";
import { PRO_AI_MONTHLY_TOKENS } from "@shared/pricing";

export function TokenUsageCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { user, isGuest } = useAuth();
  const budget = useTokenBudget();

  if (!user || isGuest || budget.isLoading) return null;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
          {t("billing.tokenUsage.title")}
        </CardTitle>
        <CardDescription>{t("billing.tokenUsage.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <TokenBalanceSummary budget={budget} />
        {!budget.isUnlimited && (
          <div className="flex flex-wrap items-center gap-3">
            {budget.isPro ? (
              <BuyTokensButton />
            ) : (
              <Button asChild size="sm">
                <Link to="/pricing">
                  <Crown className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  {t("billing.tokenUsage.upgrade", { tokens: formatTokens(PRO_AI_MONTHLY_TOKENS) })}
                </Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
