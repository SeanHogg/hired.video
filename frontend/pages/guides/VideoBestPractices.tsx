import {
  Clock,
  Lightbulb,
  Mic,
  MessageSquareText,
  UserRound,
  Sparkles,
  RotateCcw,
  Scissors,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import GuideLayout, { type GuideStep } from "@/components/guides/GuideLayout";

const TIPS = [
  { id: "short", icon: Clock },
  { id: "lighting", icon: Lightbulb },
  { id: "audio", icon: Mic },
  { id: "say", icon: MessageSquareText },
  { id: "body", icon: UserRound },
  { id: "ai", icon: Sparkles },
  { id: "timeline", icon: Scissors },
  { id: "review", icon: RotateCcw },
] as const;

export default function VideoBestPractices() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname);
  useBreadcrumbs([
    { name: t("headings.help.helpAndSupport"), url: "/help" },
    { name: t("guides.videoBestPractices.title"), url: "/guides/video-best-practices" },
  ]);

  const steps: GuideStep[] = TIPS.map(({ id, icon }) => ({
    icon,
    title: t(`guides.videoBestPractices.${id}.title`),
    body: t(`guides.videoBestPractices.${id}.body`),
  }));

  return (
    <GuideLayout
      numbered={false}
      title={t("guides.videoBestPractices.title")}
      lede={t("guides.videoBestPractices.lede")}
      steps={steps}
      prev={{ to: "/guides/getting-started", label: t("guides.gettingStarted.title") }}
      next={{ to: "/guides/networking", label: t("guides.networking.title") }}
    />
  );
}
