/**
 * `/points` route. Thin wrapper around `<PointsHub />` — the same hub
 * is mounted on `/settings?tab=points` so the canonical "cash out + see
 * badges" experience lives in one place.
 *
 * Wraps in `<AppShell>` so the page inherits header / sidebar / footer
 * + mobile bottom nav (every authenticated route does this — global
 * chrome is opt-in per page).
 */

import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { APP_PAGE_COLUMN } from "@/lib/ui/page-layout";
import { AppShell } from "@/components/AppShell";
import { PointsHub } from "@/components/points/PointsHub";

export default function PointsPage() {
  const { t } = useTranslation();
  useSEO("/points");
  useBreadcrumbs([{ name: t("tabs.pointsRewards"), url: "/points" }]);
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AppShell bgClassName="bg-background">
      <main>
        <div className={APP_PAGE_COLUMN}>
          <PointsHub />
        </div>
      </main>
    </AppShell>
  );
}
