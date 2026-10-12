// /help → Contact tab: two contact routes + system status.
//
// Every contact route flows through one mechanism. Email + the generic
// support entry open the shared <ContactPanel> so the inquiry lands in
// marketing_leads + notifies super_admins (no mailto: that silently fails
// where no mail client is registered). Live chat opens the AI assistant.

import { ExternalLink, Mail, MessageCircle, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAI } from "@/lib/ai-context";
import { useContactPanel } from "@/components/ContactPanel";
import { CONTENT_CARD, ICON_TILE } from "@/components/content/content-ui";
import { cn } from "@/lib/utils";

export default function HelpContactPanel() {
  const { t } = useTranslation();
  const { openAIChat } = useAI();
  const { openContactPanel } = useContactPanel();

  const options = [
    {
      id: "liveChat",
      icon: MessageCircle,
      title: t("labels.help.liveChat"),
      description: t("messages.help.liveChat"),
      action: t("actions.help.startChat"),
      available: t("labels.help.liveChatHours"),
      onClick: () => openAIChat(),
    },
    {
      id: "emailSupport",
      icon: Mail,
      title: t("labels.help.emailSupport"),
      description: t("messages.help.emailSupport"),
      action: t("actions.help.sendMessage"),
      available: t("labels.help.emailResponseTime"),
      onClick: () =>
        openContactPanel({
          inquiryType: "support",
          title: t("headings.help.contactSupport"),
          description: t("messages.help.contactSupportPanel"),
        }),
    },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-5">
        {options.map((option) => (
          <li key={option.id} className={cn(CONTENT_CARD, "flex flex-col gap-4 p-6")}>
            <span className={ICON_TILE}>
              <option.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-1.5">
              <h3 className="text-lg font-semibold text-foreground">{option.title}</h3>
              <p className="text-sm text-muted-foreground">{option.description}</p>
            </div>
            <p className="font-mono text-xs uppercase text-muted-foreground">{option.available}</p>
            <div className="mt-auto">
              <Button className="min-h-[44px] w-full" onClick={option.onClick}>
                {option.action}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <section className={cn(CONTENT_CARD, "flex flex-wrap items-center gap-3 p-5")}>
        <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
        <h3 className="font-semibold text-foreground">{t("headings.help.systemStatus")}</h3>
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-green" aria-hidden="true" />
          {t("messages.help.allSystemsOperational")}
        </span>
        <a
          href="https://status.hired.video"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          {t("actions.help.viewStatusPage")}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </section>
    </div>
  );
}
