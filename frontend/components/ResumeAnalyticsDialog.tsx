/**
 * Résumé analytics (#861) — the résumé adapter onto the shared
 * <MetricsPanel/>. Reads the polymorphic, cached
 * GET /api/analytics/artifacts/resume/:id (views, viewers, referrers /
 * traffic sources, countries from the edge's cf.country, views per day)
 * and renders the same panel every artifact uses, plus the views-over-time
 * chart. A 403 (viewer isn't the owner) renders the panel's empty state.
 */

import { BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import MetricsPanel from "@/components/analytics/MetricsPanel";
import ViewsOverTimeChart from "@/components/analytics/ViewsOverTimeChart";
import { fetchArtifactAnalytics } from "@/lib/services/artifact-view-service";

interface ResumeAnalyticsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  resumeId: string;
  resumeName: string;
}

export default function ResumeAnalyticsDialog({
  isOpen,
  onClose,
  resumeId,
  resumeName,
}: ResumeAnalyticsDialogProps) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["artifact-metrics", "resume", resumeId],
    queryFn: async () => {
      try {
        return await fetchArtifactAnalytics("resume", resumeId);
      } catch (e) {
        if ((e as { status?: number })?.status === 403) return null;
        throw e;
      }
    },
    enabled: isOpen,
    staleTime: 60_000,
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" aria-hidden />
            {t("resumeAnalytics.title")}
          </DialogTitle>
          <DialogDescription>{t("resumeAnalytics.description", { name: resumeName })}</DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-4">
          <ViewsOverTimeChart series={query.data?.viewsOverTime} />
          <MetricsPanel
            metrics={query.data ?? null}
            loading={query.isLoading}
            error={query.error ? t("resumeAnalytics.loadError") : null}
            kind="resume"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t("resumeAnalytics.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
