// Signed-out pitch for /tasks: hero, capability figures, feature cards, the
// per-audience checklists and the closing ink band. The page keeps rendering
// its surface tab strip above this so visitors can flip to Discover.

import { useTranslation } from "react-i18next";
import { Briefcase, Calendar, Target, TrendingUp, Users } from "lucide-react";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { SeoHero } from "@/components/landing/SeoHero";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { StatRow } from "@/components/app-marketing/StatRow";
import { FeatureCardGrid } from "@/components/app-marketing/FeatureCardGrid";

export default function TasksMarketing() {
  const { t } = useTranslation();

  const stats = [
    { value: t("labels.threshold10Plus"), label: t("labels.taskStatTaskTypesDesc") },
    { value: t("labels.taskStatThreeViews"), label: t("labels.taskStatThreeViewsDesc") },
    { value: t("labels.taskStatPriorities"), label: t("labels.taskStatPrioritiesDesc") },
    { value: t("labels.taskStatRoles"), label: t("labels.taskStatRolesDesc") },
  ];

  return (
    <main>
      <SeoHero
        eyebrow={t("labels.taskManagement")}
        title={t("messages.stayOrganizedAhead")}
        lede={t("messages.taskManagementValueProp")}
        primary={{ to: "/signup", label: t("actions.getStartedFree") }}
        secondary={{ to: "/login", label: t("actions.signIn") }}
      />

      <div className="mx-auto w-full max-w-[1200px] px-6 pb-16">
        <StatRow stats={stats} />
      </div>

      <MarketingBand tone="card" labelledBy="tasks-features-title" className="flex flex-col gap-10">
        <MarketingSectionIntro id="tasks-features-title" title={t("headings.everyCareerMoveOrganized")} />
        <FeatureCardGrid
          items={[
            {
              key: "calendar",
              icon: Calendar,
              title: t("headings.taskCalendarTimeline"),
              description: t("messages.taskCalendarTimelineDesc"),
              bullets: [t("labels.taskFeatureMonthWeek"), t("labels.taskFeatureDragDrop"), t("labels.taskFeatureDeadlineReminders")],
            },
            {
              key: "role",
              icon: Target,
              title: t("headings.taskRoleSpecific"),
              description: t("messages.taskRoleSpecificDesc"),
              bullets: [t("labels.taskFeatureJobAppsInterviews"), t("labels.taskFeatureRecruiterSourcing"), t("labels.taskFeatureOnboardingTeam")],
            },
            {
              key: "progress",
              icon: TrendingUp,
              title: t("headings.taskProgressTracking"),
              description: t("messages.taskProgressTrackingDesc"),
              bullets: [t("labels.taskFeatureTodoFlow"), t("labels.taskFeaturePriorityLevels"), t("labels.taskFeatureFilterByStatus")],
            },
          ]}
        />
      </MarketingBand>

      <MarketingBand labelledBy="tasks-stages-title" className="flex flex-col gap-10">
        <MarketingSectionIntro id="tasks-stages-title" title={t("headings.builtForEveryStage")} />
        <FeatureCardGrid
          minCardWidth={300}
          items={[
            {
              key: "seekers",
              icon: Briefcase,
              title: t("labels.jobSeekers"),
              bullets: [
                t("labels.taskFeatureTrackByCompany"),
                t("labels.taskFeatureScheduleInterviewPrep"),
                t("labels.taskFeatureFollowUpReminders"),
                t("labels.taskFeatureNetworkingOutreach"),
              ],
            },
            {
              key: "hiring",
              icon: Users,
              title: t("labels.outreachRecruitersEmployersTitle"),
              bullets: [
                t("labels.taskFeatureCandidateSourcing"),
                t("labels.taskFeatureInterviewSchedulingCoord"),
                t("labels.taskFeatureOfferOnboarding"),
                t("labels.taskFeaturePipelineMgmt"),
              ],
            },
          ]}
        />
      </MarketingBand>

      <SeoFinalCta
        id="tasks"
        title={t("messages.stopLosingOpportunities")}
        body={t("messages.taskManagementBenefits")}
        primary={{ to: "/signup", label: t("actions.getStartedFree") }}
      />
    </main>
  );
}
