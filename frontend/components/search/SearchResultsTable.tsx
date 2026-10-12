// Dense table for the heterogeneous search feed. Search results span voices,
// services, courses, templates, tools, resumes, jobs, companies, people, etc.,
// so the columns are deliberately generic: Name/Title, a human Type label, a
// best-effort secondary field (price / category / company), and a View action
// that reuses each result's detail-page route. Styling mirrors the shared
// browse-table pattern (TABLE_SURFACE / TABLE_HEAD) so every surface's Table
// view looks identical.

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TABLE_HEAD, TABLE_SURFACE } from "@/lib/ui/table-surface";
import { searchItemSecondary, searchItemTitle } from "@/lib/search/unified-search";

/** result `type` → the localized category label (raw type as last resort). */
const TYPE_LABEL_KEYS: Record<string, string> = {
  voice: "search.category.voices",
  service: "search.category.services",
  course: "search.category.courses",
  template: "search.category.templates",
  tool: "search.category.tools",
  resume: "search.category.resumes",
  job: "search.category.jobs",
  company: "search.category.companies",
  people: "search.category.people",
  video: "search.category.media",
  article: "search.category.articles",
  guide: "search.category.guides",
  faq: "search.category.faqs",
};

export function searchTypeLabel(type: string, t: TFunction): string {
  const key = TYPE_LABEL_KEYS[type];
  return key ? t(key) : type;
}

interface Props {
  items: any[];
  hrefFor: (item: any) => string | null;
  onView: (item: any) => void;
}

export function SearchResultsTable({ items, hrefFor, onView }: Props) {
  const { t } = useTranslation();
  return (
    <div className={TABLE_SURFACE}>
      <table className="w-full text-left text-sm">
        <thead className={TABLE_HEAD}>
          <tr>
            <th className="px-3 py-2 font-medium">{t("labels.name")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.type")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.details")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("labels.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const href = hrefFor(item);
            const title = searchItemTitle(item);
            return (
              <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2">
                  {href ? (
                    <Link to={href} className="font-medium text-foreground hover:text-primary">
                      {title}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onView(item)}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {title}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{searchTypeLabel(item.type, t)}</td>
                <td className="px-3 py-2 text-muted-foreground">{searchItemSecondary(item)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onView(item)}>
                      <Eye className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      {t("actions.view")}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
