import { GraduationCap, Users, Wrench } from "lucide-react";
import { useEffect } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import HeaderSearch from "@/components/HeaderSearch";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/lib/auth";
import { APP_PAGE_COLUMN } from "@/lib/ui/page-layout";
import { ToolsBrowser } from "@/components/ToolsBrowser";
import ViewModeToggle, { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import { useViewMode } from "@/lib/hooks/useViewMode";
import LearningPanel, { LEARNING_VIEW_MODES } from "@/components/courses/LearningPanel";
import ClassroomsPanel from "@/components/courses/ClassroomsPanel";
import {
  ToolsFinalCta,
  ToolsHowItWorks,
  ToolsIndexHero,
  ToolsSentimentSpotlight,
} from "@/components/tools/ToolsIndexSections";

export default function Tools() {
  const location = useLocation();
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();

  // SEO for tools page
  useSEO(location.pathname);
  useDefaultBreadcrumbs();

  // Learning sub-tab's layout switcher. Lifted up here (instead of living
  // inside LearningPanel) so the toggle can render next to the global search
  // in PageHeader's actions slot, while the panel below consumes the same
  // controlled state. Same persisted key as before so the choice survives.
  const [learningView, setLearningView] = useViewMode(
    "tools.learning",
    "grid",
    LEARNING_VIEW_MODES,
  );
  // Classrooms sub-tab's cohort-browse layout switcher. Lifted up here for
  // the same reason as `learningView` — the Scroll / Grid / Table toggle
  // renders in the PageHeader action panel while ClassroomsPanel consumes
  // the controlled state. Every content surface carries this control.
  const [classroomsView, setClassroomsView] = useViewMode(
    "tools.classrooms",
    "grid",
    BROWSE_VIEW_MODES,
  );

  const [searchParams, setSearchParams] = useSearchParams();
  // Sub-tab on /tools:
  //   "tools"      — default AI-tool grid
  //   "learning"   — consolidated learning home: your in-progress + assigned
  //                  training AND the built-in Content Library in one unified,
  //                  in-progress-first list (Scroll / Card / Table), plus a
  //                  goal + join-classroom sidebar. Competes with LinkedIn
  //                  Learning by being bundled into every plan.
  //   "classrooms" — educator/employer cohort hub + progress roll-up (#1890)
  // The old "my-learning" tab (#1889) was folded into "learning"; the param
  // is still honoured as an alias so existing links/notifications resolve.
  // Learning + plans live under /tools (no separate sidebar item).
  const rawTab = searchParams.get("tab");
  const tabParam =
    rawTab === "learning" || rawTab === "my-learning"
      ? "learning"
      : rawTab === "classrooms"
        ? "classrooms"
        : "tools";

  // #1401 — outside the default Tools grid the AI-tool filter params
  // (audience / tier / category) are irrelevant; the chip rows that set
  // them aren't rendered either. Scrub them from the URL on tab switch so
  // the URL never carries stale state that nothing reads.
  useEffect(() => {
    if (tabParam === "tools") return;
    const next = new URLSearchParams(searchParams);
    let changed = false;
    for (const key of ["audience", "tier", "category"] as const) {
      if (next.has(key)) {
        next.delete(key);
        changed = true;
      }
    }
    if (changed) setSearchParams(next, { replace: true });
  }, [tabParam, searchParams, setSearchParams]);

  // Signed-out visitors get the marketing index: hero → the filterable
  // catalog (every tool + woven courses, `roleGated={false}` so the whole
  // catalog shows while the role query is disabled) → how it works →
  // spotlight → closing CTA.
  if (!isAuthenticated || !user) {
    return (
      <AppShell bgClassName="bg-background">
        <main>
          <ToolsIndexHero />
          {/* The catalog sits directly under the ONE hero — no second
              heading + paragraph restating it before the first card. */}
          <section
            aria-labelledby="tools-hero-title"
            className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 pb-[72px]"
          >
            <ToolsBrowser roleGated={false} weaveCourses courseLimit={12} />
          </section>
          <ToolsHowItWorks />
          <ToolsSentimentSpotlight />
          <ToolsFinalCta />
        </main>
      </AppShell>
    );
  }

  // Signed-in: the Tools / Learning / Classrooms tab bar (with the global
  // search inline) pins as the action bar; the tools tab then reads like
  // the Templates index — title + lede, filter row, card grid.
  return (
    <AppShell bgClassName="bg-background">
      <div className={APP_PAGE_COLUMN}>
        <PageHeader
          tabs={[
            { key: "tools", label: t("labels.tools.tabTools"), icon: Wrench, to: "/tools" },
            { key: "learning", label: t("labels.tools.tabLearning"), icon: GraduationCap, to: "/tools?tab=learning" },
            { key: "classrooms", label: t("labels.tools.tabClassrooms"), icon: Users, to: "/tools?tab=classrooms" },
          ]}
          activeTabKey={tabParam}
          search={<HeaderSearch />}
          actions={
            tabParam === "learning" ? (
              <ViewModeToggle
                value={learningView}
                onChange={setLearningView}
                modes={LEARNING_VIEW_MODES}
              />
            ) : tabParam === "classrooms" ? (
              <ViewModeToggle
                value={classroomsView}
                onChange={setClassroomsView}
                modes={BROWSE_VIEW_MODES}
              />
            ) : undefined
          }
        />

        {tabParam === "learning" ? (
          <LearningPanel view={learningView} onViewChange={setLearningView} />
        ) : tabParam === "classrooms" ? (
          <ClassroomsPanel view={classroomsView} />
        ) : (
          <div className="flex flex-col gap-6 pb-12 pt-4">
            <header className="flex max-w-[40em] flex-col gap-2.5">
              <h1 className="font-display text-[clamp(36px,4.4vw,56px)] font-bold leading-none tracking-[-0.03em] text-foreground">
                {t("tools.index.title")}
              </h1>
              <p className="text-[17px] text-muted-foreground">{t("tools.index.subtitle")}</p>
            </header>
            <div>
              <ToolsBrowser />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
