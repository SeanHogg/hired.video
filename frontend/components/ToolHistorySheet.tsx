// Slide-out side panel that wraps the polymorphic ToolHistoryPanel.
// Used two ways:
//   1. Opened from an entity's "..." menu (resume/job/video/...) — the
//      sheet shows every tool run against that entity, and the "Run
//      again" button inside the panel deep-links to each tool's full
//      page with the entity preselected.
//   2. Opened from a full-page tool (/tools/*) — the sheet shows every
//      run of that tool the caller has made. "Run again" calls back
//      into the host page (typically a scroll-to-top reset).

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToolHistoryPanel, type ToolHistorySource } from "@/components/ToolHistoryPanel";
import { getCatalogTool } from "@/data/tools-catalog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: ToolHistorySource;
  /** Display name for the header subtitle. For `entity` source this is
   *  the entity's title; for `user` source it's the user's name/email. */
  entityName?: string;
  /** Fired when "Run again" is clicked inside a `mine`-source sheet —
   *  the parent decides what re-run means on its page (usually scroll
   *  to the input form). Ignored on `entity` sources, which deep-link
   *  to the tool's page directly, and on `user` sources, which are
   *  read-only. */
  onRunAgain?: (toolId: string) => void;
  /** Catalog tool id to pre-expand in the panel's accordion. Used when the
   *  sheet is opened from a clicked score chip so the user lands on the
   *  relevant tool's history. */
  initialToolId?: string;
}

export function ToolHistorySheet({ open, onOpenChange, source, entityName, onRunAgain, initialToolId }: Props) {
  const toolLabel =
    (source.kind === "mine" || source.kind === "user") && source.toolId
      ? getCatalogTool(source.toolId)?.title
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
            initialToolId={initialToolId}
            onRunAgain={
              onRunAgain
                ? (toolId) => {
                    onOpenChange(false);
                    onRunAgain(toolId);
                  }
                : undefined
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
