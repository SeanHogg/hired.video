import React from "react";
import { AlertCircle, AlertTriangle, Zap, Crown } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { AIUsageState } from "@/hooks/use-ai-usage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AIUsageLimitBannerProps {
  usage: AIUsageState;
  /** Override the upgrade destination (default: "/pricing") */
  upgradeUrl?: string;
  /** Allow the user to dismiss the banner */
  onDismiss?: () => void;
  /**
   * Visual variant:
   * - "inline" — compact bar suitable for side panels (default)
   * - "banner" — full-width alert suitable for page-level placement
   */
  variant?: "inline" | "banner";
  /** Extra class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Reusable banner that communicates AI usage status.
 *
 * Renders nothing when:
 * - Usage is still loading
 * - User is on an unlimited (paid) plan and `variant` is not "inline"
 *
 * Shows a compact premium badge for unlimited users in "inline" mode,
 * a warning when approaching the limit, and a hard-stop upgrade CTA
 * when the limit is exhausted.
 */
export function AIUsageLimitBanner({
  usage,
  upgradeUrl = "/pricing",
  onDismiss,
  variant = "inline",
  className,
}: AIUsageLimitBannerProps) {
  // Don't render while loading
  if (usage.isLoading) return null;

  // ── Unlimited / paid users ──────────────────────────────────────────────
  if (usage.isUnlimited) {
    // In inline mode show a small "Pro" badge so the user knows they're covered
    if (variant === "inline") {
      return (
        <div className={cn("px-4 py-2 border-b bg-gradient-to-r from-brand-purple/10 to-brand-blue/10", className)}>
          <div className="flex items-center gap-2 text-xs">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium text-primary">Pro</span>
            <span className="text-muted-foreground">Unlimited AI tokens</span>
          </div>
        </div>
      );
    }
    // Banner mode: nothing to show for paid users
    return null;
  }

  // ── Free-tier: limit exhausted ──────────────────────────────────────────
  if (usage.isExhausted) {
    if (variant === "banner") {
      return (
        <Alert className={cn("border-destructive/60 bg-destructive/5", className)}>
          <AlertCircle className="h-4 w-4 text-destructive" />
          <AlertDescription className="flex flex-col gap-2">
            <div className="text-sm">
              <div className="mb-1 font-medium">
                Monthly AI limit reached ({usage.used}/{usage.limit})
              </div>
              <div className="text-muted-foreground">
                You&apos;ve used all {usage.limit} AI requests included in your free plan this month.
                Upgrade to Pro for unlimited access, or buy a token pack to keep going.
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
                <Link to={upgradeUrl}>
                  <Crown className="h-3 w-3 mr-1" />
                  Upgrade to Pro
                </Link>
              </Button>
              {onDismiss && (
                <Button variant="outline" size="sm" onClick={onDismiss}>
                  Dismiss
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      );
    }

    // Inline variant (panel/sidebar)
    return (
      <div className={cn("px-4 py-3 border-b bg-muted/30", className)}>
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-muted-foreground font-medium">
            AI Requests: {usage.used}/{usage.limit} used this month
          </span>
        </div>
        <Progress value={usage.percentUsed} className="h-1.5" />
        <div className="flex items-center gap-1.5 mt-2 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          <span>
            Monthly limit reached.{" "}
            <Link to={upgradeUrl} className="underline font-medium">
              Upgrade to Pro
            </Link>{" "}
            for unlimited access.
          </span>
        </div>
      </div>
    );
  }

  // ── Free-tier: approaching limit (warning) ──────────────────────────────
  if (usage.isWarning) {
    if (variant === "banner") {
      return (
        <Alert className={cn("border-yellow-500/60 bg-yellow-50 dark:bg-yellow-950/30", className)}>
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="flex flex-col gap-2">
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <div className="mb-1 font-medium">
                Running low on AI requests ({usage.used}/{usage.limit})
              </div>
              <div>
                Only {usage.remaining} request{usage.remaining === 1 ? "" : "s"} remaining this month.
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
                <Link to={upgradeUrl}>
                  <Zap className="h-3 w-3 mr-1" />
                  Upgrade for Unlimited
                </Link>
              </Button>
              {onDismiss && (
                <Button variant="outline" size="sm" onClick={onDismiss}>
                  Dismiss
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      );
    }

    // Inline variant
    return (
      <div className={cn("px-4 py-3 border-b bg-muted/30", className)}>
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-muted-foreground font-medium">
            AI Requests: {usage.used}/{usage.limit} used this month
          </span>
          <Link to={upgradeUrl} className="text-primary hover:underline font-medium">
            Upgrade for Unlimited
          </Link>
        </div>
        <Progress value={usage.percentUsed} className="h-1.5" />
        <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
          <AlertTriangle className="h-3 w-3" />
          <span>
            Only {usage.remaining} request{usage.remaining === 1 ? "" : "s"} remaining
          </span>
        </div>
      </div>
    );
  }

  // ── Free-tier: normal usage ─────────────────────────────────────────────
  if (variant === "inline") {
    return (
      <div className={cn("px-4 py-3 border-b bg-muted/30", className)}>
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-muted-foreground font-medium">
            AI Requests: {usage.used}/{usage.limit} used this month
          </span>
        </div>
        <Progress value={usage.percentUsed} className="h-1.5" />
      </div>
    );
  }

  // Banner mode with plenty of headroom: nothing to show
  return null;
}

// ---------------------------------------------------------------------------
// Companion: error-state banner shown after a 429 response
// ---------------------------------------------------------------------------

export interface AIUsageLimitErrorBannerProps {
  message: string;
  used?: number;
  limit?: number;
  upgradeUrl?: string;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Shown in catch blocks when an AI call returns USAGE_LIMIT_EXCEEDED / 429.
 * Drop this into any feature that calls AI — it renders the error inline
 * with an upgrade CTA.
 */
export function AIUsageLimitErrorBanner({
  message,
  used,
  limit,
  upgradeUrl = "/pricing",
  onDismiss,
  className,
}: AIUsageLimitErrorBannerProps) {
  return (
    <Alert className={cn("border-yellow-500 bg-yellow-50 dark:bg-yellow-950", className)}>
      <AlertCircle className="h-4 w-4 text-yellow-600" />
      <AlertDescription className="flex flex-col gap-2">
        <div className="text-sm text-yellow-800 dark:text-yellow-200">
          {used != null && limit != null && (
            <div className="mb-2">
              <strong>Usage:</strong> {used} / {limit} requests this month
            </div>
          )}
          <div>{message}</div>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
            <Link to={upgradeUrl}>
              <Zap className="h-3 w-3 mr-1" />
              Upgrade to Pro
            </Link>
          </Button>
          {onDismiss && (
            <Button variant="outline" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
