import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { SortableDragHandle } from "./SortableList";
import { useCollapseSlot } from "./CollapseContext";
import { HeaderIconButton } from "./HeaderIconButton";

interface BaseSectionItemProps {
  /** Allows callers to render decorations alongside the title (e.g. a
   *  merge-selection checkbox) by passing a ReactNode. Plain strings
   *  remain valid for the common case. */
  title: ReactNode;
  onRemove: () => void;
  children: ReactNode;
  /** Stable item id — when provided alongside a CollapseProvider in
   *  BaseSectionCard, the row gains a chevron and participates in
   *  "Collapse all". Without an id (or outside a provider), the row
   *  renders flat with no collapse affordance. */
  id?: string;
  /** Optional one-line summary shown next to the title when collapsed
   *  (e.g. "AWS · Advanced"). Falls back to nothing if omitted. */
  collapsedSummary?: ReactNode;
}

export default function BaseSectionItem({
  title,
  onRemove,
  children,
  id,
  collapsedSummary,
}: BaseSectionItemProps) {
  const slot = useCollapseSlot(id);
  const collapsed = slot?.isCollapsed ?? false;

  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-medium inline-flex items-center gap-1 min-w-0">
          <SortableDragHandle />
          {slot && (
            <HeaderIconButton
              label={collapsed ? "Expand" : "Collapse"}
              aria-expanded={!collapsed}
              onClick={slot.toggle}
            >
              {collapsed ? <ChevronRight /> : <ChevronDown />}
            </HeaderIconButton>
          )}
          <span className="truncate">{title}</span>
          {collapsed && collapsedSummary && (
            <span className="text-sm text-muted-foreground font-normal truncate ml-2">
              {collapsedSummary}
            </span>
          )}
        </h4>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {!collapsed && children}
    </div>
  );
}
