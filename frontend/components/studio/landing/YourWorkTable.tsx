/**
 * "Your work" table view — one row per kit or project, newest first. A kit
 * row shows its parts and opens the kit; a project row keeps its select
 * checkbox (bulk Delete / Merge), type, visibility and Edit / Details /
 * Delete. The header checkbox selects the page's projects.
 */
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Globe, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import Pagination, { usePaginatedList } from "@/components/Pagination";
import MediaKindBadge from "@/components/studio/shared/MediaKindBadge";
import KitParts from "@/components/workspace/home/KitParts";
import type { IdSelection } from "@/hooks/use-id-selection";
import { useTimeAgo } from "@/hooks/use-time-ago";
import type { StudioProject } from "@/lib/services/studio-service";
import { workProjects, type WorkItem } from "@/lib/studio/landing/work-items";
import { projectVisibilityVisual } from "@/lib/studio/visibility";
import { TABLE_HEAD, TABLE_SURFACE } from "@/lib/ui/table-surface";
import { kitHref, type KitRow } from "@/lib/workspace/kits";

export interface ProjectActions {
  onOpen: (id: string) => void;
  onShowDetails: (project: StudioProject) => void;
  onRequestDelete: (project: StudioProject) => void;
}

export default function YourWorkTable({
  items,
  selection,
  actions,
}: {
  items: WorkItem[];
  selection: IdSelection;
  actions: ProjectActions;
}) {
  const { t } = useTranslation();
  const { pageItems, paginationProps } = usePaginatedList(items, 12);
  const pageProjectIds = workProjects(pageItems).map((p) => p.id);
  return (
    <div>
      <div className={TABLE_SURFACE}>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className={TABLE_HEAD}>
            <tr>
              <th className="w-10 px-3 py-2">
                {pageProjectIds.length > 0 && (
                  <Checkbox
                    checked={selection.headerState(pageProjectIds)}
                    onCheckedChange={(v) => selection.setMany(pageProjectIds, v === true)}
                    aria-label={t("labels.studioLanding.selectPageAria")}
                  />
                )}
              </th>
              <th className="px-3 py-2 font-medium">{t("labels.name")}</th>
              <th className="px-3 py-2 font-medium">{t("labels.type")}</th>
              <th className="px-3 py-2 font-medium">{t("studio.landing.work.status")}</th>
              <th className="px-3 py-2 font-medium">{t("labels.updated")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("labels.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item) =>
              item.kind === "kit" ? (
                <KitTableRow key={item.id} row={item.kit} />
              ) : (
                <ProjectTableRow key={item.id} project={item.project} selection={selection} actions={actions} />
              ),
            )}
          </tbody>
        </table>
      </div>
      <Pagination {...paginationProps} />
    </div>
  );
}

const ROW = "border-b border-border last:border-0 hover:bg-muted/30 data-[state=selected]:bg-accent/60";

function KitTableRow({ row }: { row: KitRow }) {
  const { t } = useTranslation();
  const { getTimeAgo } = useTimeAgo();
  const href = kitHref(row);
  return (
    <tr className={ROW}>
      <td className="px-3 py-2" />
      <td className="px-3 py-2">
        <Link to={href} className="flex min-w-0 flex-col hover:text-brand-primary">
          <span className="truncate font-medium">{row.title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {t(row.isMaster ? "workspace.home.masterLine" : "workspace.home.versionLine", { when: getTimeAgo(row.updatedAt) })}
          </span>
        </Link>
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          {t("studio.landing.work.kitType")}
        </span>
      </td>
      <td className="px-3 py-2">
        <KitParts row={row} />
      </td>
      <td className="px-3 py-2 text-muted-foreground">{new Date(row.updatedAt).toLocaleDateString()}</td>
      <td className="px-3 py-2">
        <div className="flex justify-end">
          <Button asChild variant="outline" size="sm">
            <Link to={href}>{t("workspace.home.open")}</Link>
          </Button>
        </div>
      </td>
    </tr>
  );
}

function ProjectTableRow({
  project,
  selection,
  actions,
}: {
  project: StudioProject;
  selection: IdSelection;
  actions: ProjectActions;
}) {
  const { t } = useTranslation();
  const { Icon: VisibilityIcon } = projectVisibilityVisual(project.isPublic);
  const selected = selection.isSelected(project.id);
  return (
    <tr data-state={selected ? "selected" : undefined} className={ROW}>
      <td className="px-3 py-2">
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => selection.toggle(project.id, v === true)}
          aria-label={t("labels.studioLanding.selectProjectAria", { title: project.title })}
        />
      </td>
      <td className="px-3 py-2">
        <button type="button" onClick={() => actions.onOpen(project.id)} className="text-left font-medium hover:text-brand-primary">
          {project.title}
        </button>
      </td>
      <td className="px-3 py-2">
        <MediaKindBadge mediaKind={project.mediaKind ?? "video"} alwaysShow />
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <VisibilityIcon className="h-3.5 w-3.5" />
          {project.isPublic ? t("labels.public") : t("labels.private")}
        </span>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{new Date(project.updateDateTime).toLocaleDateString()}</td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => actions.onOpen(project.id)}>
            <Pencil className="mr-1 h-3.5 w-3.5" />
            {t("actions.edit")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => actions.onShowDetails(project)}>
            <Globe className="mr-1 h-3.5 w-3.5" />
            {t("actions.details")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actions.onRequestDelete(project)}
            aria-label={t("labels.studioLanding.deleteProjectAria", { title: project.title })}
            className="text-destructive hover:text-destructive/80"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
