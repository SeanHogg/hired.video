import { useState } from "react";
import {
  Play,
  UserPlus,
  Video,
  Mic,
  FileSearch,
  Bell,
  MessageSquare,
  Mail,
  Briefcase,
  type LucideIcon,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import ContentHero from "@/components/content/ContentHero";
import ChipFilterRow from "@/components/content/ChipFilterRow";
import { ReadingBackLink } from "@/components/content/ReadingLayout";
import { CONTENT_CARD, ICON_TILE, INDEX_COLUMN } from "@/components/content/content-ui";
import MonoChip from "@/components/templates/MonoChip";
import { cn } from "@/lib/utils";

type TutorialCategory = "gettingStarted" | "studio" | "tools" | "jobSearch" | "networking" | "recruiters";

interface Tutorial {
  id: string;
  minutes: number;
  category: TutorialCategory;
  icon: LucideIcon;
}

const CATEGORY_ORDER: TutorialCategory[] = [
  "gettingStarted",
  "studio",
  "tools",
  "jobSearch",
  "networking",
  "recruiters",
];

const TUTORIALS: Tutorial[] = [
  { id: "account", minutes: 2, category: "gettingStarted", icon: UserPlus },
  { id: "firstVideo", minutes: 5, category: "gettingStarted", icon: Video },
  { id: "tts", minutes: 3, category: "studio", icon: Mic },
  { id: "optimize", minutes: 4, category: "tools", icon: FileSearch },
  { id: "alerts", minutes: 2, category: "jobSearch", icon: Bell },
  { id: "interviews", minutes: 6, category: "tools", icon: MessageSquare },
  { id: "outreach", minutes: 3, category: "networking", icon: Mail },
  { id: "postingJobs", minutes: 4, category: "recruiters", icon: Briefcase },
];

export default function Tutorials() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname);
  useBreadcrumbs([
    { name: t("headings.help.helpAndSupport"), url: "/help" },
    { name: t("guides.tutorials.title"), url: "/guides/tutorials" },
  ]);

  const [category, setCategory] = useState<TutorialCategory | "all">("all");
  const visible = category === "all" ? TUTORIALS : TUTORIALS.filter((tut) => tut.category === category);
  const countFor = (c: TutorialCategory) => TUTORIALS.filter((tut) => tut.category === c).length;

  return (
    <AppShell bgClassName="bg-background">
      <main className="pb-[72px]">
        <div className={cn(INDEX_COLUMN, "pt-6")}>
          <ReadingBackLink to="/help">{t("guides.backToHelp")}</ReadingBackLink>
        </div>
        <ContentHero
          className="pt-4 sm:pt-6"
          eyebrow={t("guides.tutorials.eyebrow")}
          title={t("guides.tutorials.title")}
          lede={t("guides.tutorials.lede")}
        />

        <div className={cn(INDEX_COLUMN, "flex flex-col gap-6")}>
          <ChipFilterRow<TutorialCategory>
            ariaLabel={t("blog.index.categoryAria")}
            value={category}
            onChange={setCategory}
            allCount={TUTORIALS.length}
            options={CATEGORY_ORDER.map((c) => ({
              value: c,
              label: t(`guides.tutorials.category.${c}`),
              count: countFor(c),
            }))}
          />

          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-5">
            {visible.map((tutorial) => {
              const Icon = tutorial.icon;
              return (
                <li key={tutorial.id} className={cn(CONTENT_CARD, "flex flex-col gap-3 p-3.5")}>
                  {/* Thumbnail placeholder */}
                  <div className="relative flex aspect-video items-center justify-center rounded-xl bg-muted">
                    <span className={cn(ICON_TILE, "absolute left-3 top-3")}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-card text-primary shadow-sm">
                      <Play className="h-6 w-6 fill-current" aria-hidden="true" />
                    </span>
                    <MonoChip className="absolute bottom-3 right-3 bg-card">
                      {t("guides.tutorials.minutes", { count: tutorial.minutes })}
                    </MonoChip>
                  </div>
                  <div className="flex flex-col gap-1.5 px-1 pb-1">
                    <MonoChip className="self-start">{t(`guides.tutorials.category.${tutorial.category}`)}</MonoChip>
                    <h2 className="text-[17px] font-semibold leading-snug text-foreground">
                      {t(`guides.tutorials.${tutorial.id}.title`)}
                    </h2>
                    <p className="text-sm text-muted-foreground">{t(`guides.tutorials.${tutorial.id}.body`)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </main>
    </AppShell>
  );
}
