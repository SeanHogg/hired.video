import {
  FileSearch,
  Bell,
  Video,
  ClipboardList,
  BotMessageSquare,
  DollarSign,
  CalendarCheck,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import GuideLayout, { type GuideStep } from "@/components/guides/GuideLayout";

const STRATEGIES = [
  { id: "s1", icon: FileSearch },
  { id: "s2", icon: Bell },
  { id: "s3", icon: Video },
  { id: "s4", icon: ClipboardList },
  { id: "s5", icon: BotMessageSquare },
  { id: "s6", icon: DollarSign },
  { id: "s7", icon: CalendarCheck },
] as const;

export default function JobSearchStrategies() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname);
  useBreadcrumbs([
    { name: t("headings.help.helpAndSupport"), url: "/help" },
    { name: t("guides.jobSearch.title"), url: "/guides/job-search" },
  ]);

  const steps: GuideStep[] = STRATEGIES.map(({ id, icon }) => ({
    icon,
    title: t(`guides.jobSearch.${id}.title`),
    body: t(`guides.jobSearch.${id}.body`),
  }));

  return (
    <GuideLayout
      title={t("guides.jobSearch.title")}
      lede={t("guides.jobSearch.lede")}
      steps={steps}
      prev={{ to: "/guides/networking", label: t("guides.networking.title") }}
      next={{ to: "/help", label: t("actions.help.backToHelp") }}
    />
  );
}
