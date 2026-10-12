import { useTranslation } from "react-i18next";
import { Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import Pagination, { usePaginatedList } from "@/components/Pagination";
import MediaKindBadge from "@/components/studio/shared/MediaKindBadge";
import type { ContentTemplate } from "@/lib/studio/templates/catalog";
import type { StudioTemplate } from "@/lib/services/studio-templates-service";
import type { TemplateRow } from "@/lib/studio/landing/types";
import { TABLE_SURFACE, TABLE_HEAD } from "@/lib/ui/table-surface";
import { provenanceBadge } from "./provenance-badge";
import { templateLabel } from "@/lib/studio/templates/template-text";

/**
 * Dense table view of the Templates section. Same rows + handlers as the
 * scroller/grid; one row per template with kind chip + Use/Preview actions.
 */
export default function TemplateTable({
  rows,
  onPickBuiltin,
  onPreviewBuiltin,
  onPickOwned,
  onPreviewOwned,
}: {
  rows: TemplateRow[];
  onPickBuiltin: (id: string) => void;
  onPreviewBuiltin: (id: ContentTemplate) => void;
  onPickOwned: (template: StudioTemplate) => void;
  onPreviewOwned: (template: StudioTemplate) => void;
}) {
  const { t } = useTranslation();
  const { pageItems, paginationProps } = usePaginatedList(rows, 12);
  return (
    <div>
    <div className={TABLE_SURFACE}>
      <table className="w-full text-left text-sm">
        <thead className={TABLE_HEAD}>
          <tr>
            <th className="px-3 py-2 font-medium">{t("labels.name")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.type")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.studioLanding.source")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("labels.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((row) => {
            // Inline-narrow the discriminated union into one normalized
            // cell shape so the row markup is written once.
            const cells =
              row.kind === "builtin"
                ? {
                    key: `builtin:${row.template.id}`,
                    name: templateLabel(row.template, t),
                    mediaKind: row.template.mediaKind,
                    source: t("labels.studioLanding.sourceStarter"),
                    canPreview: true,
                    onUse: () => onPickBuiltin(row.template.id),
                    onPreview: () => onPreviewBuiltin(row.template.id),
                  }
                : {
                    key: `owned:${row.owned.provenance}:${row.owned.template.id}`,
                    name: row.owned.template.name,
                    mediaKind: row.owned.template.mediaKind,
                    source: provenanceBadge(t)[row.owned.provenance].label,
                    canPreview: row.owned.template.visibility !== "private",
                    onUse: () => onPickOwned(row.owned.template),
                    onPreview: () => onPreviewOwned(row.owned.template),
                  };
            return (
              <tr
                key={cells.key}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={cells.onUse}
                    className="font-medium hover:text-brand-primary"
                  >
                    {cells.name}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <MediaKindBadge mediaKind={cells.mediaKind} alwaysShow />
                </td>
                <td className="px-3 py-2 text-muted-foreground">{cells.source}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={cells.onUse}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      {t("actions.use")}
                    </Button>
                    {cells.canPreview && (
                      <Button variant="ghost" size="sm" onClick={cells.onPreview}>
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        {t("actions.preview")}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <Pagination {...paginationProps} />
    </div>
  );
}
