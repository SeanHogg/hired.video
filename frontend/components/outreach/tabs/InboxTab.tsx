/**
 * InboxTab — page-tab home for the unified inbox.
 *
 * Adds page-tab-only affordances on top of the shared InboxPanel:
 *   • Filter chips (per-mailbox, unread-only, show-dismissed).
 *   • Checkbox selection mode + bulk dismiss bar.
 *   • Slide-out detail sheet on item click (external_email today).
 *   • "Sync now" trigger + Sync History drawer + per-account
 *     min-job-score Settings drawer.
 *
 * The popover surface (CommunicationHub header dropdown) reuses the
 * same InboxPanel without any of these affordances.
 */
import { useCallback, useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { InboxPanel } from "@/components/communication/InboxPanel";
import { InboxToolbar } from "@/components/communication/InboxToolbar";
import { InboxDetailSheet } from "@/components/communication/InboxDetailSheet";
import { InboxSyncHistorySheet } from "@/components/communication/InboxSyncHistorySheet";
import { InboxSettingsSheet } from "@/components/communication/InboxSettingsSheet";
import { EmailSyncButton } from "@/components/communication/EmailSyncButton";
import {
  useCommHub,
  type EmailInboxFilters,
  type HubItem,
} from "@/hooks/use-comm-hub";

export interface InboxTabProps {
  /** Accepted for back-compat with callers that pass the page-level
   *  `commHub` (e.g. Outreach.tsx). Ignored — the tab always owns its
   *  own filter-aware hub so the chips drive its data without
   *  polluting the unfiltered hub the bell badge + Dashboard tile
   *  rely on. */
  hub?: ReturnType<typeof useCommHub>;
}

export function InboxTab(_props: InboxTabProps = {}) {
  const [filters, setFilters] = useState<EmailInboxFilters>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [openItem, setOpenItem] = useState<HubItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const hub = useCommHub({ emailFilters: filters });

  const externalEmailIds = useMemo(
    () =>
      new Set(
        hub.items
          .filter((i) => i.kind === "external_email" && i.externalEmailId)
          .map((i) => i.id),
      ),
    [hub.items],
  );

  const visibleSelectedIds = useMemo(() => {
    // Drop any stale selections (e.g. user filtered them out) so the
    // bulk action bar count stays accurate.
    return new Set(
      [...selectedIds].filter((id) => externalEmailIds.has(id)),
    );
  }, [selectedIds, externalEmailIds]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) setSelectedIds(new Set(externalEmailIds));
      else setSelectedIds(new Set());
    },
    [externalEmailIds],
  );

  const handleBulkDismiss = useCallback(async () => {
    const ids = [...visibleSelectedIds]
      .map((rowId) => {
        const it = hub.items.find((i) => i.id === rowId);
        return it?.kind === "external_email" ? it.externalEmailId ?? null : null;
      })
      .filter((x): x is string => !!x);
    if (ids.length === 0) return;
    await hub.bulkDismissExternalEmails(ids);
    setSelectedIds(new Set());
  }, [hub, visibleSelectedIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);

  const handleItemSelect = useCallback((item: HubItem) => {
    setOpenItem(item);
    setDetailOpen(true);
  }, []);

  const handleDetailMarkUnread = useCallback(
    (id: string) => {
      hub.markExternalEmailUnread(id);
    },
    [hub],
  );

  const handleDetailDismiss = useCallback(
    (id: string) => {
      hub.dismissExternalEmail(id);
    },
    [hub],
  );

  const selectableCount = externalEmailIds.size;
  const allSelected =
    selectableCount > 0 && visibleSelectedIds.size === selectableCount;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Inbox
            </CardTitle>
            <CardDescription>
              Messages, notifications, connection requests, and synced job-related
              emails from your connected mailboxes.
            </CardDescription>
          </div>
          {/* Prominent Sync button — self-gates on accounts.length so it
              disappears for users with nothing connected. Same component
              the toolbar mounts in ghost-variant; one code path. */}
          <EmailSyncButton accounts={hub.accounts} onSynced={() => hub.refresh()} />
        </div>

        {selectableCount > 0 && (
          <div className="pt-2 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="inbox-select-mode"
                checked={selectionMode}
                onCheckedChange={(v) => {
                  setSelectionMode(!!v);
                  if (!v) setSelectedIds(new Set());
                }}
              />
              <Label
                htmlFor="inbox-select-mode"
                className="text-xs cursor-pointer"
              >
                Select rows
              </Label>
            </div>
            {selectionMode && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="inbox-select-all"
                  checked={allSelected}
                  onCheckedChange={(v) => handleSelectAll(!!v)}
                />
                <Label
                  htmlFor="inbox-select-all"
                  className="text-xs cursor-pointer"
                >
                  Select all ({selectableCount})
                </Label>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs ml-auto"
              onClick={hub.markAllRead}
            >
              Mark all read
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <InboxPanel
          hub={hub}
          hideHeader
          heightClassName="min-h-[32rem] max-h-[70vh]"
          onItemSelect={
            selectionMode ? undefined : (item) => {
              // Only synced emails have a useful detail view today.
              if (item.kind === "external_email") handleItemSelect(item);
            }
          }
          selectionMode={selectionMode}
          selectedIds={visibleSelectedIds}
          onToggleSelected={toggleSelected}
          highlightedId={detailOpen ? openItem?.id ?? null : null}
          toolbar={
            <InboxToolbar
              filters={filters}
              onFiltersChange={setFilters}
              accounts={hub.accounts}
              selectedCount={visibleSelectedIds.size}
              onBulkDismiss={handleBulkDismiss}
              onClearSelection={handleClearSelection}
              onOpenHistory={() => setHistoryOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
              onRefresh={hub.refresh}
            />
          }
        />
      </CardContent>

      <InboxDetailSheet
        item={openItem}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onMarkUnread={handleDetailMarkUnread}
        onDismiss={handleDetailDismiss}
      />
      <InboxSyncHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
      <InboxSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        accounts={hub.accounts}
        onSaved={() => {
          hub.refresh();
        }}
      />
    </Card>
  );
}

export default InboxTab;
