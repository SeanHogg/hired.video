// Presentational: how many AI tokens the viewer has left, this month's use
// against the allowance, pack tokens, and the reset date. Shared by the
// settings usage card and the buy-tokens sheet so both read identically.

import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatTokens, type TokenBudgetState } from "@/hooks/use-token-budget";

interface TokenBalanceSummaryProps {
  budget: TokenBudgetState;
  className?: string;
}

export function TokenBalanceSummary({ budget, className }: TokenBalanceSummaryProps) {
  const { t, i18n } = useTranslation();

  if (budget.isUnlimited) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {t("billing.tokenUsage.unlimited", { tokens: formatTokens(budget.monthlyUsed) })}
      </p>
    );
  }

  const resetDate = new Date(budget.resetAt).toLocaleDateString(i18n.language, { month: "long", day: "numeric" });

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-2xl font-semibold tabular-nums text-foreground">
          {t("billing.tokenUsage.left", { tokens: formatTokens(budget.totalAvailable) })}
        </span>
        <span className="text-xs text-muted-foreground">{t("tokenPill.resets", { date: resetDate })}</span>
      </div>
      <Progress
        value={budget.percentUsed}
        aria-label={t("billing.tokenUsage.progressLabel", { percent: budget.percentUsed })}
        className={cn("h-2", budget.isExhausted && "[&>div]:bg-destructive")}
      />
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
        <span>
          {t("tokenPill.ofUsedThisMonth", {
            used: formatTokens(budget.monthlyUsed),
            limit: formatTokens(budget.monthlyLimit),
          })}
        </span>
        {budget.packBalance > 0 && (
          <span>{t("tokenPill.fromPacks", { tokens: formatTokens(budget.packBalance) })}</span>
        )}
      </div>
    </div>
  );
}
