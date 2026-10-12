// Compact job tile for the sector landing page's "Open roles" grid.

import { Link } from "react-router-dom";
import { publicJobPath } from "@shared/public-paths";
import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";
import MonoChip from "@/components/templates/MonoChip";
import type { JobSummary } from "@/lib/services/job-service";

export function SectorJobTile({ job }: { job: JobSummary }) {
  const { t } = useTranslation();
  return (
    <Link
      to={publicJobPath(job.id)}
      className="flex h-full flex-col gap-2 rounded-[20px] border border-border bg-card p-5 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <h3 className="line-clamp-2 font-semibold text-foreground">{job.title}</h3>
      {job.company && <p className="line-clamp-1 text-sm text-muted-foreground">{job.company}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-sm text-muted-foreground">
        {job.location && (
          <span className="flex min-w-0 items-center gap-1">
            <MapPin className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
            <span className="line-clamp-1">{job.location}</span>
          </span>
        )}
        {job.isRemote && <MonoChip>{t("labels.remote")}</MonoChip>}
      </div>
    </Link>
  );
}
