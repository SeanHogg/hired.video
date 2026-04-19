// Slide-out side panel that wraps the polymorphic ToolHistoryPanel.
// Used two ways:
//   1. Opened from an entity's "..." menu (resume/job/video/...) — the
//      sheet shows every tool run against that entity.
//   2. Opened from a full-page tool (/tools/*) — the sheet shows every
//      run of that tool the caller has made, regardless of anchor.

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToolHistoryPanel, type ToolHistorySource } from "@/components/ToolHistoryPanel";
import { getTool } from "@/lib/tools/registry";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: ToolHistorySource;
  /** Display name for the header subtitle. For `entity` source this is
   *  the entity's title; for `user` source it's the user's name/email. */
  entityName?: string;
  /** Fired when the user clicks "Run again" inside the history panel.
   *  Omit on admin (`kind: "user"`) views — the admin isn't the one
   *  running the tool, so the affordance is hidden. */
  onRunTool?: (toolId: string) => void;
}

export function ToolHistorySheet({ open, onOpenChange, source, entityName, onRunTool }: Props) {
  const toolLabel =
    (source.kind === "mine" || source.kind === "user") && source.toolId
      ? getTool(source.toolId)?.label
      : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <div className="p-6 pb-4 border-b">
          <SheetHeader>
            <SheetTitle>Tool Run History</SheetTitle>
            <SheetDescription>
              {source.kind === "entity" ? (
                entityName
                  ? <>Every AI tool run recorded against <strong>{entityName}</strong>.</>
                  : <>Every AI tool run recorded against this {source.entityType}.</>
              ) : source.kind === "mine" ? (
                toolLabel
                  ? <>Your history running <strong>{toolLabel}</strong>.</>
                  : <>Every AI tool run you've recorded.</>
              ) : (
                entityName
                  ? <>Tool run history for <strong>{entityName}</strong>.</>
                  : <>Tool run history for this user.</>
              )}
            </SheetDescription>
          </SheetHeader>
        </div>
        <div className="p-6 pt-4">
          <ToolHistoryPanel
            source={source}
            onRunTool={
              onRunTool
                ? (toolId) => {
                    onOpenChange(false);
                    onRunTool(toolId);
                  }
                : undefined
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
