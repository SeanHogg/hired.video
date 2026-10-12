/**
 * InboxSyncHistorySheet — slide-out view of recent email sync runs.
 *
 * Backed by GET /api/inbox/sync-runs. Each row shows the count
 * breakdown (synced / job-related / excluded / jobs linked / created)
 * and the per-rule fire counter so users can audit why messages got
 * the categories they did.
 */

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import {
  emailIntegrationService,
  type EmailSyncRun,
} from "@/lib/services/email-integration-service";

type SyncRun = EmailSyncRun;

export interface InboxSyncHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function safeRelativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

const STATUS_BADGE: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700 border-emerald-200",
  partial: "bg-amber-100 text-amber-700 border-amber-200",
  error: "bg-red-100 text-red-700 border-red-200",
  running: "bg-accent text-primary border-primary/30",
};

export function InboxSyncHistorySheet({
  open,
  onOpenChange,
}: InboxSyncHistorySheetProps) {
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    emailIntegrationService
      .listSyncRuns(20)
      .then((rs) => {
        if (cancelled) return;
        setRuns(rs);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load history");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col"
        aria-describedby="sync-history-description"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle>Sync history</SheetTitle>
          <SheetDescription id="sync-history-description">
            Recent email sync runs across your connected mailboxes. Each run
            records what was filtered in or out, and which rules fired.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="p-5 text-sm text-destructive">{error}</div>
          ) : runs.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">
              No sync runs yet. Click <span className="font-medium">Sync now</span>{" "}
              to pull mail from a connected mailbox.
            </div>
          ) : (
            <ul className="divide-y">
              {runs.map((r) => {
                const ruleEntries = Object.entries(r.rulesFired ?? {})
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6);
                return (
                  <li key={r.id} className="p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {r.accountLabel ?? "Unknown mailbox"}
                      </span>
                      {r.provider && (
                        <Badge variant="outline" className="text-[10px]">
                          {r.provider}
                        </Badge>
                      )}
                      <span
                        className={`text-[10px] uppercase tracking-wide border rounded px-1.5 py-0.5 ${STATUS_BADGE[r.status] ?? STATUS_BADGE.running}`}
                      >
                        {r.status}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {safeRelativeTime(r.startedAt)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <div>
                        Synced:{" "}
                        <span className="text-foreground font-medium">
                          {r.messagesSynced}
                        </span>
                      </div>
                      <div>
                        Job-related:{" "}
                        <span className="text-emerald-700 font-medium">
                          {r.messagesJobRelated}
                        </span>
                      </div>
                      <div>
                        Excluded:{" "}
                        <span className="text-muted-foreground font-medium">
                          {r.messagesExcluded}
                        </span>
                      </div>
                      <div>
                        Classified:{" "}
                        <span className="text-foreground font-medium">
                          {r.messagesClassified}
                        </span>
                      </div>
                      <div>
                        Jobs linked:{" "}
                        <span className="text-foreground font-medium">
                          {r.jobsLinked}
                        </span>
                      </div>
                      <div>
                        Jobs created:{" "}
                        <span className="text-foreground font-medium">
                          {r.jobsCreated}
                        </span>
                      </div>
                    </div>

                    {ruleEntries.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Rules applied
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {ruleEntries.map(([rule, count]) => (
                            <span
                              key={rule}
                              className="text-[11px] border rounded-full px-2 py-0.5 bg-muted/40"
                              title={rule}
                            >
                              {rule.replace(/^default:/, "")} · {count}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {r.digestSummary && (
                      <p className="text-xs text-muted-foreground italic">
                        {r.digestSummary}
                      </p>
                    )}

                    {r.errorMessage && (
                      <p className="text-xs text-destructive">
                        {r.errorMessage}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export default InboxSyncHistorySheet;
