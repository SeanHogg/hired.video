import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/lib/hooks/useSubscription";

interface UpgradePromptProps {
  /** Short label for the gated feature, e.g. "Salary Calculator" */
  featureName: string;
  /** One-line explanation of what the user gets with Pro */
  benefit?: string;
  /** Display as inline banner (default) or as a blocking overlay */
  variant?: "banner" | "overlay";
  /** Called when the user dismisses the prompt (banner only) */
  onDismiss?: () => void;
  className?: string;
}

/**
 * Shows an upgrade call-to-action when the current user is on the free plan.
 * Renders nothing for Pro users.
 */
export function UpgradePrompt({
  featureName,
  benefit,
  variant = "banner",
  onDismiss,
  className = "",
}: UpgradePromptProps) {
  const { isPro, loading } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  if (isPro || loading || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  if (variant === "overlay") {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm">
        <div className={`flex flex-col items-center gap-4 p-8 text-center max-w-sm ${className}`}>
          <div className="p-3 rounded-full bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Upgrade to unlock {featureName}</h3>
            {benefit && <p className="text-sm text-muted-foreground mt-1">{benefit}</p>}
          </div>
          <Button asChild className="w-full">
            <Link to="/settings/billing">Upgrade to Pro</Link>
          </Button>
          <button
            onClick={handleDismiss}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 ${className}`}
    >
      <div className="flex items-center gap-3">
        <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
        <p className="text-sm">
          <span className="font-medium">{featureName} is a Pro feature.</span>
          {benefit && <span className="text-muted-foreground"> {benefit}</span>}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button size="sm" asChild>
          <Link to="/settings/billing">Upgrade</Link>
        </Button>
        {onDismiss && (
          <button
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default UpgradePrompt;
