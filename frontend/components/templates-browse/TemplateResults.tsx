// Result grid for /templates: mono count line ("12 RESUME TEMPLATES · ALL
// FREE"), responsive TemplateCard grid, and an empty state that offers to
// clear the filters.

import { useTranslation } from "react-i18next";
import { Loader2, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import TemplateCard from "@/components/resume-renderer/TemplateCard";
import { cn } from "@/lib/utils";
import type { BrowseTab } from "@/lib/templates/browse";
import type { TemplateMeta } from "@/lib/templates/types";

interface Props {
  tab: BrowseTab;
  results: TemplateMeta[];
  loading: boolean;
  onClear: () => void;
}

export default function TemplateResults({ tab, results, loading, onClear }: Props) {
  const { t } = useTranslation();

  if (results.length === 0) {
    if (loading) {
      return (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
        <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium text-foreground">{t("templates.browse.emptyTitle")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t("templates.browse.emptyBody")}</p>
        <Button variant="outline" onClick={onClear}>
          {t("templates.browse.clearFilters")}
        </Button>
      </div>
    );
  }

  const allFree = results.every((r) => r.priceCents <= 0);
  const countKey = tab === "video" ? "templates.browse.countVideo" : "templates.browse.countResume";

  return (
    <>
      <p
        className="flex items-center gap-2 font-mono text-xs uppercase text-muted-foreground"
        aria-live="polite"
      >
        {t(countKey, { count: results.length })}
        {allFree && ` · ${t("templates.browse.allFree")}`}
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      </p>
      <ul
        className={cn(
          "grid gap-5",
          tab === "video"
            ? "grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))]"
            : "grid-cols-[repeat(auto-fill,minmax(min(250px,100%),1fr))]",
        )}
      >
        {results.map((meta) => (
          <li key={meta.slug} className="flex">
            <div className="w-full">
              <TemplateCard meta={meta} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
