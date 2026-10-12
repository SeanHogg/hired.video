/**
 * ChatGeneratorPanel — the chat's "Create an image" action, ONE presentation
 * on every workspace chat (the kit's Chat and the studio's AI tab): an inline
 * panel just above the composer, titled, with a close ✕, holding the host's
 * generator (KitChatGenerator's MediaAiPromptPanel, or the format's own).
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

interface ChatGeneratorPanelProps {
  onClose: () => void;
  children: ReactNode;
}

export default function ChatGeneratorPanel({ onClose, children }: ChatGeneratorPanelProps) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("workspace.chatAction.generateImage")}
      className="flex max-h-[50%] flex-none flex-col gap-2 overflow-y-auto border-t border-border bg-card p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t("workspace.chatAction.generateImage")}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("workspace.chatAction.closeGenerator")}
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {children}
    </section>
  );
}
