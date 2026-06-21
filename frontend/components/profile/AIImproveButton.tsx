import { Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useImproveText } from "@/lib/hooks/useImproveText";

interface AIImproveButtonProps {
  field: "headline" | "about";
  /** Current field value to improve. May be empty — the model generates
   *  from `context` instead. */
  text: string;
  /** Optional profile facts the model can lean on (name / role / company). */
  context?: { name?: string; role?: string; company?: string };
  /** Receives the improved text on success. Not called on failure (a
   *  toast is shown by the shared hook). */
  onImproved: (improved: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * ✨ "Improve with AI" icon button — self-contained: owns the loading
 * spinner + failure toast via {@link useImproveText}. Styled to match the
 * standard grey ghost edit pencil so it sits cleanly beside it. Reused by
 * the Edit Profile (headline) and Edit About (bio) dialogs.
 */
export default function AIImproveButton({
  field,
  text,
  context,
  onImproved,
  disabled,
  className,
}: AIImproveButtonProps) {
  const { t } = useTranslation();
  const { improve, loading } = useImproveText();

  const handleClick = async () => {
    const improved = await improve({ field, text, context });
    if (improved) onImproved(improved);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={disabled || loading}
      aria-label={t("actions.improveWithAi")}
      title={t("actions.improveWithAi")}
      className={cn("h-8 w-8 text-muted-foreground hover:text-primary", className)}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
    </Button>
  );
}
