import { Link } from "react-router-dom";
import { Zap, Crown, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTokenBudget, formatTokens } from "@/hooks/use-token-budget";
import { cn } from "@/lib/utils";

interface AITokenPillProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function AITokenPill({ collapsed = false, onNavigate }: AITokenPillProps) {
  const budget = useTokenBudget();

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

  const href = isExhausted || !isPro ? "/pricing" : "/settings?tab=billing";

  const dotColor = isUnlimited
    ? "bg-amber-400"
    : isExhausted
      ? "bg-red-500"
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

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={href}
              onClick={onNavigate}
              className="relative flex items-center justify-center px-2 py-2 rounded-md hover:bg-muted transition-colors"
              aria-label="AI tokens"
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
            {isUnlimited ? (
              <span className="font-medium">Unlimited tokens (Admin)</span>
            ) : (
              <div className="space-y-1 text-xs">
                <div className="font-medium">
                  {formatTokens(totalAvailable)} tokens left
                </div>
                <div className="text-muted-foreground">
                  {formatTokens(monthlyUsed)} of {formatTokens(monthlyLimit)}{" "}
                  used this month
                </div>
                {packBalance > 0 && (
                  <div className="text-muted-foreground">
                    + {formatTokens(packBalance)} from packs
                  </div>
                )}
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (isUnlimited) {
    return (
      <Link
        to="/settings?tab=billing"
        onClick={onNavigate}
        className="flex items-center gap-2 px-3 py-2 rounded-md bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-950/40 dark:to-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 hover:opacity-90 transition-opacity"
      >
        <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
          Unlimited tokens
        </span>
      </Link>
    );
  }

  return (
    <Link
      to={href}
      onClick={onNavigate}
      className={cn(
        "block px-3 py-2 rounded-md border transition-colors",
        isExhausted
          ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 hover:bg-red-100/70 dark:hover:bg-red-950/50"
          : isWarning
            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 hover:bg-amber-100/70 dark:hover:bg-amber-950/50"
            : "bg-muted/40 border-border hover:bg-muted",
      )}
      aria-label="AI token budget"
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
          <span>AI tokens</span>
        </div>
        <span
          className={cn(
            "text-xs tabular-nums",
            isExhausted
              ? "text-red-700 dark:text-red-300 font-semibold"
              : "text-muted-foreground",
          )}
        >
          {formatTokens(totalAvailable)} left
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
            Buy more →
          </span>
        ) : packBalance > 0 ? (
          <span className="tabular-nums">
            +{formatTokens(packBalance)} packs
          </span>
        ) : resetLabel ? (
          <span>Resets {resetLabel}</span>
        ) : null}
      </div>
    </Link>
  );
}
