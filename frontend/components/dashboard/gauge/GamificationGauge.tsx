/**
 * GamificationGauge — self-gating, self-fetching rewards dial.
 *
 * Shows progress toward the next cash-out / unlock for points-eligible
 * roles (job_seeker / recruiter / employer — the SSoT lives in
 * isPointsEligibleRole). Reuses PointsPill's React Query cache keys
 * (["points","me"] / ["points","catalog"]) so the dashboard adds no
 * extra round-trips when the sidebar pill is already mounted. Renders
 * null for ineligible roles, while loading, or when there's nothing
 * motivating to show — drop it anywhere without guarding.
 */

import { usePointsSummary } from "@/hooks/use-points-summary";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useEffectiveRole } from "@/hooks/use-effective-role";
import {
  pointsService,
  isPointsEligibleRole,
  type PointsCatalog,
} from "@/lib/services/points-service";
import { buildGamificationGauge } from "@/lib/dashboard/gauge";
import { GaugeCard } from "./GaugeCard";

export function GamificationGauge({ className }: { className?: string }) {
  const { t } = useTranslation();
  const role = useEffectiveRole();
  const enabled = isPointsEligibleRole(role);

  const { data: summary } = usePointsSummary(enabled);

  const { data: catalog } = useQuery<PointsCatalog>({
    queryKey: ["points", "catalog"],
    queryFn: () => pointsService.getCatalog(),
    enabled,
    staleTime: 5 * 60_000,
  });

  if (!enabled || !summary) return null;

  const model = buildGamificationGauge(summary, catalog, t);
  if (!model) return null;

  return <GaugeCard model={model} className={className} />;
}

export default GamificationGauge;
