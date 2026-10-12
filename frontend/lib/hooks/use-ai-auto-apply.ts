// One-line hook for reading the user's `aiAutoApplyChanges` preference.
// Lives next to other settings hooks so the chat panel and the
// ToolCallCard share one source instead of each fetching the bundle.

import { useEffect, useState } from "react";
import { settingsService } from "@/lib/services/settings-service";

export function useAIAutoApply(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    settingsService
      .getExtensionSettings()
      .then((s) => {
        if (!cancelled) setEnabled(Boolean(s.ai?.autoApplyChanges));
      })
      .catch(() => {
        // Settings unavailable (e.g. signed-out preview) — default to
        // confirm-before-apply, the safer behaviour.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}
