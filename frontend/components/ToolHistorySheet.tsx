// Slide-out side panel that wraps the polymorphic ToolHistoryPanel.
// Opened from an entity's "..." menu via the "Tool Run History" item so
// the history never eats space in the main page layout.

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToolHistoryPanel } from "@/components/ToolHistoryPanel";
import type { ToolEntityType } from "@/lib/tools/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: ToolEntityType;
  entityId: string;
  entityName?: string;
  /** Fired when the user clicks "Run again" inside the history panel. */
  onRunTool: (toolId: string) => void;
}

export function ToolHistorySheet({ open, onOpenChange, entityType, entityId, entityName, onRunTool }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <div className="p-6 pb-4 border-b">
          <SheetHeader>
            <SheetTitle>Tool Run History</SheetTitle>
            <SheetDescription>
              {entityName
                ? <>Every AI tool run recorded against <strong>{entityName}</strong>.</>
                : <>Every AI tool run recorded against this {entityType}.</>}
            </SheetDescription>
          </SheetHeader>
        </div>
        <div className="p-6 pt-4">
          <ToolHistoryPanel
            entityType={entityType}
            entityId={entityId}
            onRunTool={(toolId) => {
              onOpenChange(false);
              onRunTool(toolId);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
