// Dense table layout for the /tools browse switcher's Table view (split
// out of ToolsBrowser). Renders the same woven tool/course list the card
// layouts use.

import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import MonoChip from "@/components/templates/MonoChip";
import { ToolCategoryBadge } from "@/components/ToolCategoryBadge";
import { TABLE_SURFACE, TABLE_HEAD } from "@/lib/ui/table-surface";
import { localizeTool } from "@/lib/tools/localize-tool";
import type { WovenItem } from "@/lib/tools/weave-courses";

/**
 * Dense table layout for the /tools browse switcher's Table view. Mirrors
 * the ResumeOwnedTable idiom (border, muted header, hover rows, ghost-button
 * action cell) so the browse surfaces stay visually consistent. Renders the
 * same woven tool/course list the card layouts use — a course row carries a
 * "Course" badge in the category column and deep-links to the course page,
 * so the Table view stays in sync with Scroll/Grid when courses are woven in.
 */
export function ToolsTable({ items }: { items: WovenItem[] }) {
  const { t } = useTranslation();
  return (
    <div className={TABLE_SURFACE}>
      <table className="w-full text-left text-sm">
        <thead className={TABLE_HEAD}>
          <tr>
            <th className="px-3 py-2 font-medium">{t("labels.name", "Name")}</th>
            <th className="px-3 py-2 font-medium">
              {t("labels.category", "Category")}
            </th>
            <th className="px-3 py-2 font-medium">
              {t("labels.description", "Description")}
            </th>
            <th className="px-3 py-2 text-right font-medium">
              {t("labels.actions", "Actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            if (item.kind === "course") {
              const course = item.value;
              const href = `/courses/${course.author.slug}/${course.slug}`;
              return (
                <tr
                  key={item.key}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2">
                    <Link
                      to={href}
                      className="font-medium hover:text-primary"
                    >
                      {course.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <MonoChip>{t("labels.tools.courseBadge", "Course")}</MonoChip>
                  </td>
                  <td className="max-w-md px-3 py-2 text-muted-foreground">
                    <span className="line-clamp-1">{course.summary ?? ""}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
                        <Link to={href}>
                          {t("actions.open", "Open")}
                          <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            }
            const tool = localizeTool(item.value, t);
            return (
              <tr
                key={item.key}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2">
                  <Link
                    to={tool.href}
                    className="font-medium hover:text-primary"
                  >
                    {tool.title}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <ToolCategoryBadge category={tool.category} />
                </td>
                <td className="max-w-md px-3 py-2 text-muted-foreground">
                  <span className="line-clamp-1">{tool.description}</span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Button asChild variant="ghost" size="sm" className="min-h-[44px]">
                      <Link to={tool.href}>
                        {t("actions.open", "Open")}
                        <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
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
