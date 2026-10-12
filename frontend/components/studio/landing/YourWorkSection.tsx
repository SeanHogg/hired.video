import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import StudioBulkActionBar from "@/components/studio/my-content/StudioBulkActionBar";
import { useViewMode } from "@/lib/hooks/useViewMode";
import type { YourWorkList } from "@/lib/studio/landing/use-my-content";
import { workProjects } from "@/lib/studio/landing/work-items";
import YourWorkHeader from "./YourWorkHeader";
import YourWorkEmptyState from "./YourWorkEmptyState";
import YourWorkView from "./YourWorkView";

/** Rows shown before "Show all" — keeps the templates below in reach. */
const PREVIEW_COUNT = 6;

/**
 * /studio "Your work" — ONE list of the viewer's kits and every other
 * project (was "Your kits" + "My content"), with the All / Kits / Other /
 * Posted / Drafts filter, the Scroll / Grid / Table toggle, the workspace
 * switcher and the bulk Delete / Merge bar (projects). Grid and Table show
 * the newest few until "Show all". Data comes from `useMyContent` (owned by
 * the page so the shared `create` prepends into the same list).
 */
export default function YourWorkSection({ content }: { content: YourWorkList }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Persisted per section via `useViewMode` so the choice survives reloads.
  const [viewMode, setViewMode] = useViewMode("studio.work", "table", BROWSE_VIEW_MODES);
  const [expanded, setExpanded] = useState(false);
  const {
    signedIn,
    loading,
    workItems,
    totalWorkCount,
    workFilter,
    setWorkFilter,
    contentSelection,
    selectedProjects,
    setDetailsProject,
    setDeletingProject,
    removeProjects,
    patchProject,
    addMerged,
  } = content;

  const collapsible = viewMode !== "scroll" && !expanded && workItems.length > PREVIEW_COUNT;
  const shown = collapsible ? workItems.slice(0, PREVIEW_COUNT) : workItems;
  const projects = workProjects(workItems);

  return (
    <section aria-labelledby="your-work" className="mb-12">
      <YourWorkHeader filter={workFilter} onFilterChange={setWorkFilter} viewMode={viewMode} onViewModeChange={setViewMode} />
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-video animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : workItems.length === 0 ? (
        <YourWorkEmptyState signedIn={signedIn} totalWorkCount={totalWorkCount} />
      ) : (
        <>
          <StudioBulkActionBar
            selected={selectedProjects}
            totalCount={projects.length}
            onSelectAll={() => contentSelection.setMany(projects.map((p) => p.id), true)}
            onClear={contentSelection.clear}
            onDeleted={removeProjects}
            onMerged={addMerged}
          />
          <YourWorkView
            items={shown}
            viewMode={viewMode}
            selection={contentSelection}
            actions={{
              onOpen: (id) => navigate(`/studio/${encodeURIComponent(id)}`),
              onShowDetails: setDetailsProject,
              onRequestDelete: setDeletingProject,
              onRenamed: patchProject,
            }}
          />
          {collapsible && (
            <div className="mt-3 flex justify-center">
              <Button variant="outline" onClick={() => setExpanded(true)}>
                {t("studio.landing.work.showAll", { count: workItems.length })}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
