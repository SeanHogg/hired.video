/**
 * DashboardGaugeRow — the role-aware speedometer hero for the top of a
 * role dashboard. Pairs the role's primary dial (job-readiness, creator
 * momentum, hiring-pipeline health) with the self-gating gamification
 * dial. The gamification card renders itself away for ineligible roles
 * (e.g. creators), so the row collapses to just the primary gauge with
 * no branching here.
 */

import { GaugeCard } from "./GaugeCard";
import { GamificationGauge } from "./GamificationGauge";
import type { GaugeModel } from "@/lib/dashboard/gauge";

interface Props {
  /** The role's primary gauge. Omit to show only the gamification dial. */
  primary?: GaugeModel | null;
}

export function DashboardGaugeRow({ primary }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      {primary && <GaugeCard model={primary} />}
      <GamificationGauge />
    </div>
  );
}

export default DashboardGaugeRow;
