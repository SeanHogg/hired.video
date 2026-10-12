/** "★ MASTER" or "VERSION OF ★ MASTER · <master> · 23% different" — where the
 *  open résumé sits. Renders nothing for a standalone / unsaved résumé. */
import { useTranslation } from "react-i18next";
import type { ResumeLineage } from "@shared/resume-lineage";

export default function LineageBadge({ lineage }: { lineage: ResumeLineage | null }) {
  const { t } = useTranslation();
  if (!lineage || lineage.role === "standalone") return null;
  if (lineage.role === "master") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-md bg-foreground px-1.5 py-1 text-[11px] font-semibold leading-none text-background">
        {t("review.lineage.master")}
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span className="whitespace-nowrap rounded-md border border-border bg-muted px-1.5 py-1 text-[11px] font-semibold leading-none text-foreground">
        {t("review.lineage.version")}
      </span>
      {lineage.master && <span className="truncate">{lineage.master.title}</span>}
      {lineage.diffPercent !== null && <span>· {t("review.lineage.different", { pct: lineage.diffPercent })}</span>}
    </span>
  );
}
