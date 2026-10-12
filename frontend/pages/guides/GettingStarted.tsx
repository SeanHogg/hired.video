import { UserPlus, UserCircle, FileText, Video, Search, Users } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import GuideLayout, { type GuideStep } from "@/components/guides/GuideLayout";

const STEPS = [
  { id: "s1", icon: UserPlus },
  { id: "s2", icon: UserCircle },
  { id: "s3", icon: FileText },
  { id: "s4", icon: Video },
  { id: "s5", icon: Search },
  { id: "s6", icon: Users },
] as const;

export default function GettingStarted() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname);
  useBreadcrumbs([
    { name: t("headings.help.helpAndSupport"), url: "/help" },
    { name: t("guides.gettingStarted.title"), url: "/guides/getting-started" },
  ]);

  const steps: GuideStep[] = STEPS.map(({ id, icon }) => ({
    icon,
    title: t(`guides.gettingStarted.${id}.title`),
    body: t(`guides.gettingStarted.${id}.body`),
  }));

  return (
    <GuideLayout
      title={t("guides.gettingStarted.title")}
      lede={t("guides.gettingStarted.lede")}
      steps={steps}
      next={{ to: "/guides/video-best-practices", label: t("guides.videoBestPractices.title") }}
    />
  );
}
