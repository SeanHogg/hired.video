import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { aiService } from "@/lib/services/ai-service";
import { logger } from "@/lib/logger";

export interface ImproveTextInput {
  field: "headline" | "about";
  text: string;
  context?: { name?: string; role?: string; company?: string };
}

/**
 * Shared controller for the ✨ "improve with AI" affordance on short
 * profile fields (headline tagline + About bio). Owns the loading flag and
 * failure toast so every call site — the Edit Profile dialog, the Edit
 * About dialog, and the auto-kickoff from the About section header — behaves
 * identically. Returns `null` on failure (already toasted) so callers can
 * `if (improved) setValue(improved)` without their own try/catch.
 */
export function useImproveText() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const improve = useCallback(
    async (input: ImproveTextInput): Promise<string | null> => {
      setLoading(true);
      try {
        return await aiService.improveText(input);
      } catch (err) {
        logger.warn("improveText failed", { error: err, field: input.field });
        toast.error(t("messages.aiImproveFailed"));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  return { improve, loading };
}
