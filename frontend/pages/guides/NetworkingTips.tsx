import { UserCircle, Search, MessageSquare, PlayCircle, Building2, Send } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import GuideLayout, { type GuideStep } from "@/components/guides/GuideLayout";

const TIPS = [
  { id: "profile", icon: UserCircle },
  { id: "search", icon: Search },
  { id: "messages", icon: MessageSquare },
  { id: "engage", icon: PlayCircle },
  { id: "follow", icon: Building2 },
  { id: "outreach", icon: Send },
] as const;

export default function NetworkingTips() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname);
  useBreadcrumbs([
    { name: t("headings.help.helpAndSupport"), url: "/help" },
    { name: t("guides.networking.title"), url: "/guides/networking" },
  ]);

  const steps: GuideStep[] = TIPS.map(({ id, icon }) => ({
    icon,
    title: t(`guides.networking.${id}.title`),
    body: t(`guides.networking.${id}.body`),
  }));

  return (
    <GuideLayout
      numbered={false}
      title={t("guides.networking.title")}
      lede={t("guides.networking.lede")}
      steps={steps}
      prev={{ to: "/guides/video-best-practices", label: t("guides.videoBestPractices.title") }}
      next={{ to: "/guides/job-search", label: t("guides.jobSearch.title") }}
    />
  );
}
