/**
 * Inboxes panel for the Email connections page — lists connected
 * mailboxes, hosts the Connect / Sync-now buttons, and shows the recent
 * sync-run activity with AI digest.
 *
 * Owns its own data: accounts + sync runs are read together because the
 * Sync-now button mutates both. Rule data lives in the sibling
 * <EmailRulesPanel> and is fetched there.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, RefreshCw, Trash2, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ConnectMailboxButtons } from "@/components/email/ConnectMailboxButtons";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import {
  emailIntegrationService,
  type ConnectedEmailAccount,
  type EmailSyncRun,
} from "@/lib/services/email-integration-service";

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function EmailInboxesPanel() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<ConnectedEmailAccount[]>([]);
  const [runs, setRuns] = useState<EmailSyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  // Per-mailbox selection for the Sync-now button. Defaults to "every
  // active account selected" on each refresh — newly connected mailboxes
  // opt-in automatically; the user can deselect to limit Gmail/Outlook
  // quota spend or LLM cost.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [a, s] = await Promise.all([
        emailIntegrationService.listAccounts(),
        emailIntegrationService.listSyncRuns(8),
      ]);
      setAccounts(a);
      setRuns(s);
      setSelected(new Set(a.filter((acc) => acc.status === "active").map((acc) => acc.id)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    refresh();
  }, [isAuthenticated, refresh]);

  const handleDisconnect = async (id: string) => {
    if (!confirm("Disconnect this mailbox? Synced messages stay; new emails will stop arriving.")) return;
    await emailIntegrationService.disconnect(id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    toast({ title: "Mailbox disconnected" });
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(accounts.map((a) => a.id)) : new Set());
  };

  const handleSyncNow = async () => {
    if (selected.size === 0) return;
    setSyncing(true);
    try {
      const result = await emailIntegrationService.syncNow([...selected]);
      const total = result.summaries.reduce((acc, s) => acc + s.messagesSynced, 0);
      const errored = result.summaries.filter((s) => s.status === "error");
      if (errored.length > 0) {
        toast({
          title: "Sync partial",
          description:
            `${total} message${total === 1 ? "" : "s"} across ${result.accounts - errored.length}/${result.accounts} mailbox${result.accounts === 1 ? "" : "es"}. ` +
            `${errored.length} failed — see Recent Sync Activity for details.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sync complete",
          description: `${total} message${total === 1 ? "" : "s"} synced across ${result.accounts} mailbox${result.accounts === 1 ? "" : "es"}.`,
        });
      }
      await refresh();
    } catch (err) {
      toast({
        title: "Sync failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  if (!isAuthenticated) return null;

  const allSelected = accounts.length > 0 && selected.size === accounts.length;
  const someSelected = selected.size > 0 && selected.size < accounts.length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Inboxes
          </CardTitle>
          <CardDescription>
            Connect Gmail or Outlook to sync messages into your unified inbox. We classify each email,
            link it to jobs you've applied to, and surface inbound recruiter pitches with an AI summary.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sync-now lives at the top so the primary action is the first
              thing users see, and applies to the checked mailboxes below. */}
          {accounts.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleAll(v === true)}
                  aria-label="Select all mailboxes"
                />
                <span className="text-sm text-muted-foreground">
                  {selected.size} of {accounts.length} selected
                </span>
              </div>
              <Button onClick={handleSyncNow} disabled={syncing || selected.size === 0}>
                <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
                Sync selected
              </Button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-sm text-muted-foreground">No mailboxes connected yet.</div>
          ) : (
            <div className="space-y-2">
              {accounts.map((a) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  selected={selected.has(a.id)}
                  onToggle={toggleSelected}
                  onDisconnect={handleDisconnect}
                />
              ))}
            </div>
          )}
          <Separator />
          <ConnectMailboxButtons />
        </CardContent>
      </Card>

      <SyncHistory runs={runs} />
    </div>
  );
}

interface AccountRowProps {
  account: ConnectedEmailAccount;
  selected: boolean;
  onToggle: (id: string, checked: boolean) => void;
  onDisconnect: (id: string) => void;
}

function AccountRow({ account, selected, onToggle, onDisconnect }: AccountRowProps) {
  return (
    <div className="flex items-center gap-3 border rounded p-3">
      <Checkbox
        checked={selected}
        onCheckedChange={(v) => onToggle(account.id, v === true)}
        aria-label={`Select ${account.accountEmail} for sync`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="capitalize">
            {account.provider}
          </Badge>
          <span className="font-medium truncate">{account.accountEmail}</span>
          {account.status === "active" ? (
            <Badge variant="outline" className="text-emerald-700 border-emerald-300">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Active
            </Badge>
          ) : (
            <Badge variant="destructive">
              <AlertCircle className="h-3 w-3 mr-1" /> {account.status}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Last synced {formatRelative(account.lastSyncedAt)}
          {account.lastError && <span className="text-destructive ml-2">— {account.lastError}</span>}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onDisconnect(account.id)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface SyncHistoryProps {
  runs: EmailSyncRun[];
}

function SyncHistory({ runs }: SyncHistoryProps) {
  const latest = useMemo(() => runs.find((r) => r.digestSummary), [runs]);
  if (runs.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Sync Activity</CardTitle>
        {latest?.digestSummary && (
          <CardDescription className="pt-1 text-foreground">{latest.digestSummary}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          {runs.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={r.status === "success" ? "outline" : r.status === "error" ? "destructive" : "secondary"}>
                  {r.status}
                </Badge>
                <span className="text-muted-foreground">{formatRelative(r.startedAt)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {r.messagesSynced} synced · {r.messagesClassified} classified ·{" "}
                {r.jobsLinked} linked · {r.jobsCreated} jobs created
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default EmailInboxesPanel;
