/**
 * InboxToolbar — page-tab-only filter + bulk-action bar that sits above
 * the InboxPanel list. The popover surface skips this entirely; the bar
 * is mounted by `InboxTab` and passed in via the `toolbar` slot so the
 * shared list component stays presentation-only.
 *
 * Lays out two rows when there's something to show:
 *   • Row 1 — filter chips (account multi-select, unread, archived)
 *             + Sync now button + Sync history opener.
 *   • Row 2 — bulk action bar (visible when at least one row is
 *             selected): "n selected · Dismiss / Clear".
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, History, Inbox, Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { emailIntegrationService } from "@/lib/services/email-integration-service";
import type { EmailInboxFilters, InboxAccount } from "@/hooks/use-comm-hub";

export interface InboxToolbarProps {
  filters: EmailInboxFilters;
  onFiltersChange: (next: EmailInboxFilters) => void;
  accounts: InboxAccount[];
  /** Currently selected row ids — only the bulk action bar cares. */
  selectedCount: number;
  onBulkDismiss: () => void;
  onClearSelection: () => void;
  /** Open the Sync History sheet. The parent owns the sheet so this
   *  component stays a pure toolbar. */
  onOpenHistory: () => void;
  /** Open the Settings drawer where minJobScore lives. */
  onOpenSettings: () => void;
  /** Manual refresh — re-fetches /api/inbox after the sync completes
   *  so newly classified messages appear immediately. */
  onRefresh: () => void;
}

export function InboxToolbar({
  filters,
  onFiltersChange,
  accounts,
  selectedCount,
  onBulkDismiss,
  onClearSelection,
  onOpenHistory,
  onOpenSettings,
  onRefresh,
}: InboxToolbarProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const toggleAccount = (accountId: string) => {
    const current = new Set(filters.accountIds ?? []);
    if (current.has(accountId)) current.delete(accountId);
    else current.add(accountId);
    onFiltersChange({
      ...filters,
      accountIds: current.size === 0 ? undefined : [...current],
    });
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      // Sync every active mailbox. The shared service returns the
      // per-account rollup so the user sees what just happened.
      const { summaries } = await emailIntegrationService.syncNow();
      const synced = summaries.reduce((n, s) => n + (s.messagesSynced ?? 0), 0);
      const job = summaries.reduce((n, s) => n + (s.messagesJobRelated ?? 0), 0);
      const excluded = summaries.reduce((n, s) => n + (s.messagesExcluded ?? 0), 0);
      setSyncResult(`Synced ${synced} · ${job} job · ${excluded} filtered`);
      onRefresh();
    } catch (err) {
      setSyncResult(err instanceof Error ? `Sync failed: ${err.message}` : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="border-b shrink-0">
      <div className="flex items-center gap-2 flex-wrap px-3 py-2">
        <Inbox className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <FilterChip
          active={!!filters.unreadOnly}
          onClick={() =>
            onFiltersChange({ ...filters, unreadOnly: !filters.unreadOnly })
          }
        >
          Unread only
        </FilterChip>
        <FilterChip
          active={!!filters.includeArchived}
          onClick={() =>
            onFiltersChange({
              ...filters,
              includeArchived: !filters.includeArchived,
            })
          }
        >
          Show dismissed
        </FilterChip>

        {accounts.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap pl-2 border-l">
            {accounts.map((a) => {
              const label = a.accountLabel?.trim() || a.accountEmail;
              const active = filters.accountIds?.includes(a.id) ?? false;
              return (
                <FilterChip
                  key={a.id}
                  active={active}
                  onClick={() => toggleAccount(a.id)}
                  title={`${a.provider} · ${a.accountEmail}`}
                >
                  {label}
                </FilterChip>
              );
            })}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {syncResult && (
            <span className="text-[11px] text-muted-foreground mr-2">
              {syncResult}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={handleSyncNow}
            disabled={syncing || accounts.length === 0}
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Sync now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onOpenHistory}
          >
            <History className="h-3.5 w-3.5 mr-1" />
            History
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onOpenSettings}
            disabled={accounts.length === 0}
          >
            Settings
          </Button>
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-t">
          <Badge variant="secondary">{selectedCount} selected</Badge>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs"
            onClick={onBulkDismiss}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Dismiss
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onClearSelection}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}

function FilterChip({ active, onClick, title, children }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "text-[11px] rounded-full border px-2 py-0.5 transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

export default InboxToolbar;
