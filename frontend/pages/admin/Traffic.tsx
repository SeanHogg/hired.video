// /admin/insights?view=traffic — SuperAdmin traffic + funnels. Visitors and
// sources come from the usage tracker (usage_sessions / usage_events); funnels
// are the registry in shared/usage.ts; API health comes from request_logs.
// Chrome comes from <AdminLayout> at the route.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { USAGE_FUNNELS, type TrafficWindowDays } from "@shared/usage";
import { useAdminPermissions } from "@/lib/admin-permissions";
import { TrafficWindowPicker } from "@/components/admin/traffic/TrafficWindowPicker";
import { TrafficTrendCard } from "@/components/admin/traffic/TrafficTrendCard";
import { TrafficSourcesCard } from "@/components/admin/traffic/TrafficSourcesCard";
import { FunnelCard } from "@/components/admin/traffic/FunnelCard";
import { ApiHealthCard } from "@/components/admin/traffic/ApiHealthCard";

export default function Traffic() {
  const { t } = useTranslation();
  const { canAccess } = useAdminPermissions();
  const [days, setDays] = useState<TrafficWindowDays>(30);
  if (!canAccess("traffic")) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("admin.traffic.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("admin.traffic.subtitle")}</p>
        </div>
        <TrafficWindowPicker value={days} onChange={setDays} />
      </header>

      <TrafficTrendCard days={days} />

      <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
        {USAGE_FUNNELS.map((f) => (
          <FunnelCard key={f.id} funnelId={f.id} days={days} />
        ))}
      </div>

      <TrafficSourcesCard days={days} />
      <ApiHealthCard />
    </div>
  );
}
