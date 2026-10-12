/**
 * Cross-job candidate pipeline (#405) at /recruit/pipeline.
 *
 * One Loxo / Bullhorn / Greenhouse-style board that aggregates every
 * candidate across all the recruiter's manageable jobs, grouped by stage —
 * so the desk is worked in one place instead of clicking into each job's
 * per-job pipeline (`/jobs/:id?tab=candidates`). The board itself is
 * CrossJobKanban (self-gating + self-fetching); this page is chrome only.
 */

import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePermissions } from "@/hooks/use-permissions";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import CrossJobKanban from "@/components/recruit/CrossJobKanban";

export default function CrossJobPipeline() {
  const { t } = useTranslation();
  const location = useLocation();
  useSEO(location.pathname);
  useBreadcrumbs([
    { name: t("crossJobPipeline.breadcrumbJobs"), url: "/jobs" },
    { name: t("crossJobPipeline.title"), url: "/recruit/pipeline" },
  ]);

  const { canManageJobs } = usePermissions();

  if (!canManageJobs) {
    return (
      <AppShell>
        <div className="px-4 py-6">
          <Alert>
            <AlertDescription>
              {t("crossJobPipeline.recruiterOnly")}
            </AlertDescription>
          </Alert>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-4 py-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
          <div>
            <h1 className="text-2xl font-bold">{t("crossJobPipeline.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("crossJobPipeline.subtitle")}</p>
          </div>
          <Link to="/resumes?tab=sourced" className="text-sm text-primary hover:underline">
            {t("crossJobPipeline.sourcedPoolLink")}
          </Link>
        </div>

        <CrossJobKanban />
      </div>
    </AppShell>
  );
}
