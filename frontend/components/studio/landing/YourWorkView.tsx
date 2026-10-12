/**
 * "Your work" view switcher — Scroll / Grid / Table over kits + projects.
 * Scroll + Grid put a KitCard or a StudioProjectCard per item in one row /
 * grid; Table is YourWorkTable. Project items stay multi-selectable through
 * the shared `IdSelection` (card checkbox / row checkbox / header).
 */
import { type ReactNode } from "react";
import Pagination, { usePaginatedList } from "@/components/Pagination";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import StudioProjectCard from "@/components/studio/my-content/StudioProjectCard";
import KitCard from "@/components/workspace/home/KitCard";
import type { IdSelection } from "@/hooks/use-id-selection";
import type { ViewMode } from "@/lib/hooks/useViewMode";
import type { StudioProject } from "@/lib/services/studio-service";
import type { WorkItem } from "@/lib/studio/landing/work-items";
import YourWorkTable, { type ProjectActions } from "./YourWorkTable";

interface Props {
  items: WorkItem[];
  viewMode: ViewMode;
  selection: IdSelection;
  actions: ProjectActions & { onRenamed: (next: StudioProject) => void };
}

export default function YourWorkView({ items, viewMode, selection, actions }: Props) {
  if (viewMode === "table") return <YourWorkTable items={items} selection={selection} actions={actions} />;

  const renderCard = (item: WorkItem) =>
    item.kind === "kit" ? (
      <KitCard key={item.id} row={item.kit} />
    ) : (
      <StudioProjectCard
        key={item.id}
        project={item.project}
        onOpen={() => actions.onOpen(item.project.id)}
        onShowDetails={() => actions.onShowDetails(item.project)}
        onRenamed={actions.onRenamed}
        onRequestDelete={() => actions.onRequestDelete(item.project)}
        selected={selection.isSelected(item.project.id)}
        selectionActive={selection.size > 0}
        onSelectedChange={(checked) => selection.toggle(item.project.id, checked)}
      />
    );
  // Scroll is a horizontal carousel — unpaginated by design (swipe through
  // the row). Grid + Table are the "browse everything" modes and page.
  if (viewMode === "scroll") {
    return <HorizontalScroller itemCount={items.length}>{items.map(renderCard)}</HorizontalScroller>;
  }
  return <WorkGrid items={items} renderCard={renderCard} />;
}

function WorkGrid({ items, renderCard }: { items: WorkItem[]; renderCard: (item: WorkItem) => ReactNode }) {
  const { pageItems, paginationProps } = usePaginatedList(items, 12);
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{pageItems.map(renderCard)}</div>
      <Pagination {...paginationProps} />
    </div>
  );
}
