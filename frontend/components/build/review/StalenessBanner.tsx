/** "Your master changed after this version was made → Pull into this
 *  version" — offered on a stale version; the pull is a merge review
 *  (master → this version), so nothing changes until it is applied. */
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResumeLineage } from "@shared/resume-lineage";

interface StalenessBannerProps {
  lineage: ResumeLineage | null;
  onPull: (masterId: string, masterTitle: string) => void;
  /** Hidden while that pull (or any review) is open. */
  hidden?: boolean;
}

export default function StalenessBanner({ lineage, onPull, hidden }: StalenessBannerProps) {
  const { t } = useTranslation();
  if (hidden || !lineage?.stale || !lineage.master) return null;
  const master = lineage.master;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-[12.5px] text-foreground"
    >
      <span className="min-w-[200px] flex-1">{t("review.stale.body", { date: new Date(master.updatedAt).toLocaleDateString() })}</span>
      <Button size="sm" variant="outline" className="min-h-11 gap-1.5 bg-card sm:min-h-8" onClick={() => onPull(master.id, master.title)}>
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        {t("review.stale.pull")}
      </Button>
    </div>
  );
}
