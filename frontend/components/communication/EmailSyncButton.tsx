/**
 * EmailSyncButton — single source of truth for the "Sync now" action.
 *
 * Mounted in [InboxToolbar](./InboxToolbar.tsx) next to History / Settings.
 * Self-gates: returns null when the user has no connected mailboxes,
 * so consumers don't have to prop-drill a `canSync` boolean.
 *
 * Drives the **client-side** sync orchestrator
 * (`frontend/lib/email-integration/sync-client.ts`) which fetches mail
 * directly from Gmail/Outlook in the browser, runs Stage-1
 * classification client-side, then POSTs chunks to
 * `/api/inbox/external-emails/ingest`. This bypasses the per-invocation
 * Cloudflare Workers subrequest budget that the original server-sweep
 * path hit (see Gap Register #755).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { runClientSync, type ClientSyncSummary } from "@/lib/email-integration/sync-client";
import type { InboxAccount } from "@/hooks/use-comm-hub";

export interface EmailSyncButtonProps {
  accounts: InboxAccount[];
  /** Called after a sync finishes (success or partial) so the parent
   *  can refresh the inbox feed to surface newly classified messages. */
  onSynced?: (summaries: ClientSyncSummary[]) => void;
  className?: string;
}

export function EmailSyncButton({
  accounts,
  onSynced,
  className,
}: EmailSyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);

  if (accounts.length === 0) return null;

  const handleSync = async () => {
    setSyncing(true);
    setResultText(null);
    try {
      const summaries = await runClientSync(accounts);
      const fetched = summaries.reduce((n, s) => n + s.messagesFetched, 0);
      const job = summaries.reduce((n, s) => n + s.messagesJobRelated, 0);
      const excluded = summaries.reduce((n, s) => n + s.messagesExcluded, 0);
      const errored = summaries.filter((s) => s.status === "error");
      if (errored.length > 0) {
        const first = errored[0];
        setResultText(`Sync error: ${first.errorMessage ?? "unknown"}`);
      } else {
        setResultText(`Fetched ${fetched} · ${job} job · ${excluded} filtered`);
      }
      onSynced?.(summaries);
    } catch (err) {
      setResultText(err instanceof Error ? `Sync failed: ${err.message}` : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {resultText && (
        <span className="text-[11px] text-muted-foreground mr-1">{resultText}</span>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        onClick={handleSync}
        disabled={syncing}
      >
        {syncing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
        )}
        Sync now
      </Button>
    </div>
  );
}

export default EmailSyncButton;
