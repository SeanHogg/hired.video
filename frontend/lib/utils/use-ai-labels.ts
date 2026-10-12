import { useTranslation } from "react-i18next";
import type { AIContextType } from "@/lib/types/ai-context";
import { getContextLabel, getActionLabel } from "@/lib/utils/ai-context-helpers";

/**
 * Localized AI context/action labels for the Brain panel.
 *
 * The English maps in `ai-context-helpers` stay the framework-free
 * source of default copy; this hook layers i18n on top — the lookup key
 * is derived from the id (`aiChat.contextLabel.<type>` /
 * `aiChat.actionLabel.<action>`) and the English map supplies the
 * fallback default. That keeps a single English source while making the
 * context chip + suggestion chips translatable. Both call sites in
 * `AIChatPanel` go through here, so there's no per-call `t(...)`
 * boilerplate to keep in sync.
 */
export function useAiLabels() {
  const { t } = useTranslation();
  return {
    contextLabel: (contextType: AIContextType): string =>
      t(`aiChat.contextLabel.${contextType}`, getContextLabel(contextType)),
    actionLabel: (action: string): string =>
      t(`aiChat.actionLabel.${action}`, getActionLabel(action)),
  };
}
