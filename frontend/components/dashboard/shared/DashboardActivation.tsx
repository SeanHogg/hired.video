import React from "react";
import OnboardingProgress from "./OnboardingProgress";
import NextBestActionCard from "./NextBestActionCard";
import ActivityFeed from "./ActivityFeed";
import type { BaseDashboard } from "@/lib/services/dashboard-service";

interface DashboardActivationProps {
  dashboardData: BaseDashboard;
  loading?: boolean;
}

/**
 * Shared activation header for every role dashboard (gaps #1825 / #1826 /
 * #1827). Bundles the three cross-role surfaces — onboarding checklist, the
 * AI Next Best Action card, and the last-touched activity timeline — so they
 * live in ONE place instead of being copy-pasted (or, worse, only rendered on
 * one role's dashboard as before). Each child self-gates (renders null when it
 * has nothing to show), so this is safe to mount unconditionally.
 */
export function DashboardActivation({ dashboardData, loading = false }: DashboardActivationProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <OnboardingProgress
        tasks={dashboardData.onboardingTasks ?? []}
        completionPercentage={dashboardData.onboardingCompletionPercentage}
        loading={loading}
      />
      <NextBestActionCard
        recommendations={dashboardData.recommendations ?? []}
        loading={loading}
      />
      {(dashboardData.recentActivity?.length ?? 0) > 0 && (
        <ActivityFeed activities={dashboardData.recentActivity} loading={loading} />
      )}
    </div>
  );
}

export default DashboardActivation;
