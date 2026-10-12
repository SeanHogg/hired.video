// AI-token limit surfaces, driven by the live token budget (useTokenBudget).
//
//   <AIUsageLimitBanner>       — compact inline notice for AI panels: shows
//                                only when the viewer is running low or out.
//   <AIUsageLimitErrorBanner>  — shown after an AI call is refused (429).
//
// Both pick the next step from the viewer's plan: Pro tops up with a token
// pack (BuyTokensButton → global sheet); Free upgrades to Pro. Unlimited/staff
// never see either. Replaces the old request-count copy ("AI requests",
// "Upgrade for unlimited"), which no longer matched how AI is metered.

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, AlertTriangle, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { formatTokens, useTokenBudget } from "@/hooks/use-token-budget";
import { BuyTokensButton } from "@/components/billing/BuyTokensButton";

/** The plan-appropriate next step: buy a pack (Pro) or upgrade (Free). */
function LimitAction({ upgradeUrl }: { upgradeUrl: string }) {
  const { t } = useTranslation();
  const budget = useTokenBudget();
  if (budget.isUnlimited) return null;
  if (budget.isPro) return <BuyTokensButton />;
  return (
    <Button asChild size="sm">
      <Link to={upgradeUrl}>
        <Crown className="mr-1 h-3 w-3" aria-hidden="true" />
        {t("aiUsageBanner.upgrade")}
      </Link>
    </Button>
  );
}

export interface AIUsageLimitBannerProps {
  className?: string;
}

/** Inline low/out-of-tokens notice for AI panels. Renders nothing while the
 *  viewer has comfortable headroom (the sidebar pill already shows it). */
export function AIUsageLimitBanner({ className }: AIUsageLimitBannerProps) {
  const { t } = useTranslation();
  const budget = useTokenBudget();
  if (budget.isLoading || budget.isUnlimited) return null;
  if (!budget.isExhausted && !budget.isWarning) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs",
        budget.isExhausted ? "bg-destructive/10 text-destructive" : "bg-muted/40 text-foreground",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 font-medium">
        {budget.isExhausted ? (
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {budget.isExhausted
          ? t("aiUsageBanner.outShort")
          : t("aiUsageBanner.lowShort", { tokens: formatTokens(budget.totalAvailable) })}
      </span>
      <LimitAction upgradeUrl="/pricing" />
    </div>
  );
}

export interface AIUsageLimitErrorBannerProps {
  message: string;
  /** Tokens used / allowance, when the refusal carried them. */
  used?: number;
  limit?: number;
  upgradeUrl?: string;
  onDismiss?: () => void;
  className?: string;
}

/** Shown after an AI call is refused for budget. Drop into any AI feature. */
export function AIUsageLimitErrorBanner({
  message,
  used,
  limit,
  upgradeUrl = "/pricing",
  onDismiss,
  className,
}: AIUsageLimitErrorBannerProps) {
  const { t } = useTranslation();
  const { refresh } = useTokenBudget();

  // The refusal means the cached budget is stale — refetch so the action
  // (buy vs upgrade) and the pill reflect the server's view.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Alert className={cn("border-border bg-muted/40", className)}>
      <AlertCircle className="h-4 w-4 text-destructive" />
      <AlertDescription className="flex flex-col gap-2">
        <div className="text-sm text-foreground">
          {used != null && limit != null && (
            <div className="mb-2 font-medium tabular-nums">
              {t("aiUsageBanner.usage", { used: formatTokens(used), limit: formatTokens(limit) })}
            </div>
          )}
          <div>{message}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <LimitAction upgradeUrl={upgradeUrl} />
          {onDismiss && (
            <Button variant="outline" size="sm" onClick={onDismiss}>
              {t("aiUsageBanner.dismiss")}
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
