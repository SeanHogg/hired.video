import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { SortableDragHandle } from "./SortableList";

interface BaseSectionItemProps {
  /** Allows callers to render decorations alongside the title (e.g. a
   *  merge-selection checkbox) by passing a ReactNode. Plain strings
   *  remain valid for the common case. */
  title: ReactNode;
  onRemove: () => void;
  children: ReactNode;
}

export default function BaseSectionItem({
  title,
  onRemove,
  children,
}: BaseSectionItemProps) {
  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <div className="flex items-center justify-between">
        <h4 className="font-medium inline-flex items-center gap-1">
          <SortableDragHandle />
          {title}
        </h4>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {children}
    </div>
  );
}
