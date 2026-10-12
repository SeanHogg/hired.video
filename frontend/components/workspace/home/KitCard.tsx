/**
 * KitCard — one kit in the studio home's "Your work" scroll / grid views:
 * the résumé's title, its master / version line, its parts, and the whole
 * card opens the kit's workspace. Same footprint as StudioProjectCard so
 * kits and projects sit in one grid.
 */
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import { kitHref, type KitRow } from "@/lib/workspace/kits";
import { useTimeAgo } from "@/hooks/use-time-ago";
import KitParts from "./KitParts";

export default function KitCard({ row }: { row: KitRow }) {
  const { t } = useTranslation();
  const { getTimeAgo } = useTimeAgo();
  return (
    <Link
      to={kitHref(row)}
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-brand-primary hover:shadow-md"
    >
      <div className="flex aspect-video items-center justify-center bg-primary/10 text-primary">
        <FileText className="h-8 w-8" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{row.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {t(row.isMaster ? "workspace.home.masterLine" : "workspace.home.versionLine", { when: getTimeAgo(row.updatedAt) })}
          </p>
        </div>
        <KitParts row={row} />
      </div>
    </Link>
  );
}
