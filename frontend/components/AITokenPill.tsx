import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Zap, Crown, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth";
import { useTokenBudget, formatTokens } from "@/hooks/use-token-budget";
import { cn } from "@/lib/utils";
import { FREE_AI_MONTHLY_TOKENS } from "@shared/pricing";
import { API_ERROR_EVENT, type ApiErrorEvent } from "@shared/errors/apiErrorEvent";

interface AITokenPillProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function AITokenPill({ collapsed = false, onNavigate }: AITokenPillProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const budget = useTokenBudget();

  // Vendor plan exhaustion (AI_USAGE_LIMIT_REACHED) is global to the
  // operator, not per-user. These hooks must run BEFORE the early returns
  // below (logged-out teaser / loading) so hook order stays stable (#1871).
  const [aiLimitHit, setAiLimitHit] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ApiErrorEvent>).detail;
      if (detail?.code === "AI_USAGE_LIMIT_REACHED") setAiLimitHit(true);
    };
    window.addEventListener(API_ERROR_EVENT, handler);
    return () => window.removeEventListener(API_ERROR_EVENT, handler);
  }, []);

  // Logged-out teaser — same chrome as the free-tier pill so the sidebar
  // looks consistent for anonymous visitors. Click-through routes to the
  // /pricing marketing page (NOT /settings) so signed-out users land on
  // something they can actually act on.
  if (!isAuthenticated) {
    if (collapsed) {
      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/pricing"
                onClick={onNavigate}
                className="relative flex items-center justify-center px-2 py-2 rounded-md hover:bg-muted transition-colors"
                aria-label={t("tokenPill.ariaSeePlans")}
              >
                <Zap className="h-4 w-4 text-muted-foreground" />
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full ring-2 ring-background bg-emerald-500" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <div className="space-y-1 text-xs">
                <div className="font-medium">
                  {t("tokenPill.freeTokensPerMonth", {
                    tokens: formatTokens(FREE_AI_MONTHLY_TOKENS),
                  })}
                </div>
                <div className="text-muted-foreground">
                  {t("tokenPill.signUpPrompt")}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return (
      <Link
        to="/pricing"
        onClick={onNavigate}
        className="block px-3 py-2 rounded-md border border-border bg-muted/40 hover:bg-muted transition-colors"
        aria-label={t("tokenPill.ariaSeePlans")}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span>{t("tokenPill.title")}</span>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("tokenPill.freePerMo", {
              tokens: formatTokens(FREE_AI_MONTHLY_TOKENS),
            })}
          </span>
        </div>
        <Progress value={0} className="h-1.5" />
        <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
          <span>{t("tokenPill.percentUsed", { percent: 0 })}</span>
          <span className="font-medium text-primary">{t("tokenPill.seePlans")}</span>
        </div>
      </Link>
    );
  }

  const clearLimitOnClick = () => setAiLimitHit(false);

  if (budget.isLoading) return null;

  const {
    isUnlimited,
    isPro,
    monthlyUsed,
    monthlyLimit,
    monthlyRemaining,
    packBalance,
    totalAvailable,
    percentUsed,
    isWarning,
    isExhausted,
    resetAt,
  } = budget;

  // Vendor-plan-exhausted overrides per-user state — even an admin /
  // unlimited viewer is locked out until our daily plan resets, so the
  // pill should communicate the same "upgrade" CTA all viewers get.
  const showLimitHit = aiLimitHit || isExhausted;
  const href = showLimitHit || !isPro ? "/pricing" : "/settings?tab=billing";

  const dotColor = showLimitHit
    ? "bg-red-500"
    : isUnlimited
      ? "bg-amber-400"
      : isWarning
        ? "bg-amber-500"
        : "bg-emerald-500";

  const resetLabel = (() => {
    try {
      return new Date(resetAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch {
      return null;
    }
  })();

  const handleClick = () => {
    clearLimitOnClick();
    onNavigate?.();
  };

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={href}
              onClick={handleClick}
              className="relative flex items-center justify-center px-2 py-2 rounded-md hover:bg-muted transition-colors"
              aria-label={t("tokenPill.title")}
            >
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span
                className={cn(
                  "absolute top-1 right-1 h-2 w-2 rounded-full ring-2 ring-background",
                  dotColor,
                )}
              />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            {aiLimitHit ? (
              <div className="space-y-1 text-xs">
                <div className="font-medium text-red-700 dark:text-red-300">
                  {t("tokenPill.limitReached")}
                </div>
                <div className="text-muted-foreground">
                  {t("tokenPill.upgradePrompt")}
                </div>
              </div>
            ) : isUnlimited ? (
              <div className="space-y-1 text-xs">
                <div className="font-medium">{t("tokenPill.unlimitedAdmin")}</div>
                <div className="text-muted-foreground">
                  {t("tokenPill.usedThisMonth", {
                    tokens: formatTokens(monthlyUsed),
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-xs">
                <div className="font-medium">
                  {t("tokenPill.tokensLeftLong", {
                    tokens: formatTokens(totalAvailable),
                  })}
                </div>
                <div className="text-muted-foreground">
                  {t("tokenPill.ofUsedThisMonth", {
                    used: formatTokens(monthlyUsed),
                    limit: formatTokens(monthlyLimit),
                  })}
                </div>
                {packBalance > 0 && (
                  <div className="text-muted-foreground">
                    {t("tokenPill.fromPacks", {
                      tokens: formatTokens(packBalance),
                    })}
                  </div>
                )}
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (aiLimitHit) {
    return (
      <Link
        to="/pricing"
        onClick={handleClick}
        className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 hover:bg-red-100/70 dark:hover:bg-red-950/50 transition-colors"
        aria-label={t("tokenPill.ariaLimitUpgrade")}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
          <span className="text-sm font-medium text-red-900 dark:text-red-200">
            {t("tokenPill.limitReachedShort")}
          </span>
        </div>
        <span className="text-[11px] font-semibold text-red-700 dark:text-red-300">
          {t("tokenPill.upgrade")}
        </span>
      </Link>
    );
  }

  if (isUnlimited) {
    return (
      <Link
        to="/settings?tab=billing"
        onClick={handleClick}
        className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-950/40 dark:to-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 hover:opacity-90 transition-opacity"
      >
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {t("tokenPill.unlimited")}
          </span>
        </div>
        <span className="text-[11px] tabular-nums text-amber-800/80 dark:text-amber-200/70">
          {t("tokenPill.usedShort", { tokens: formatTokens(monthlyUsed) })}
        </span>
      </Link>
    );
  }

  return (
    <Link
      to={href}
      onClick={handleClick}
      className={cn(
        "block px-3 py-2 rounded-md border transition-colors",
        isExhausted
          ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 hover:bg-red-100/70 dark:hover:bg-red-950/50"
          : isWarning
            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 hover:bg-amber-100/70 dark:hover:bg-amber-950/50"
            : "bg-muted/40 border-border hover:bg-muted",
      )}
      aria-label={t("tokenPill.ariaBudget")}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {isExhausted ? (
            <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
          ) : (
            <Zap
              className={cn(
                "h-3.5 w-3.5",
                isWarning
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-primary",
              )}
            />
          )}
          <span>{t("tokenPill.title")}</span>
        </div>
        <span
          className={cn(
            "text-xs tabular-nums",
            isExhausted
              ? "text-red-700 dark:text-red-300 font-semibold"
              : "text-muted-foreground",
          )}
        >
          {t("tokenPill.leftShort", { tokens: formatTokens(totalAvailable) })}
        </span>
      </div>

      <Progress
        value={percentUsed}
        className={cn(
          "h-1.5",
          isExhausted && "[&>div]:bg-red-500",
          !isExhausted && isWarning && "[&>div]:bg-amber-500",
        )}
      />

      <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          {formatTokens(monthlyUsed)} / {formatTokens(monthlyLimit)}
        </span>
        {isExhausted ? (
          <span className="font-medium text-red-700 dark:text-red-300">
            {t("tokenPill.buyMore")}
          </span>
        ) : packBalance > 0 ? (
          <span className="tabular-nums">
            {t("tokenPill.packsShort", { tokens: formatTokens(packBalance) })}
          </span>
        ) : resetLabel ? (
          <span>{t("tokenPill.resets", { date: resetLabel })}</span>
        ) : null}
      </div>
    </Link>
  );
}
