/**
 * Email Integrations section in /settings — connect Gmail/Outlook
 * mailboxes, manage classification rules, run a manual sync, view the
 * recent sync history with AI digests.
 *
 * Self-gating: returns null when the user isn't authenticated. The
 * Settings host doesn't gate it — the component owns its own visibility
 * per the DRY rule on shared components.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, Plus, RefreshCw, Trash2, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import {
  emailIntegrationService,
  type ConnectedEmailAccount,
  type EmailUserRule,
  type EmailSyncRun,
  type EmailProviderId,
} from "@/lib/services/email-integration-service";

const RULE_FIELDS = [
  { value: "from_email", label: "Sender email" },
  { value: "from_domain", label: "Sender domain" },
  { value: "subject", label: "Subject" },
  { value: "body", label: "Body" },
  { value: "any", label: "Anywhere" },
] as const;

const RULE_OPS = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "equals" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "regex", label: "matches regex" },
] as const;

const RULE_CATEGORIES = [
  "job_opportunity",
  "application_status",
  "recruiter_outreach",
  "interview_invite",
  "offer",
  "rejection",
  "newsletter",
  "spam",
  "personal",
  "other",
] as const;

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

export function EmailIntegrationsSection() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<ConnectedEmailAccount[]>([]);
  const [rules, setRules] = useState<EmailUserRule[]>([]);
  const [runs, setRuns] = useState<EmailSyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [a, r, s] = await Promise.all([
        emailIntegrationService.listAccounts(),
        emailIntegrationService.listRules(),
        emailIntegrationService.listSyncRuns(8),
      ]);
      setAccounts(a);
      setRules(r);
      setRuns(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    refresh();
  }, [isAuthenticated, refresh]);

  // Surface OAuth callback redirects (`?connected=gmail` / `?error=...`)
  // as a toast so users see what happened.
  useEffect(() => {
    if (!isAuthenticated) return;
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("connected");
    const errorCode = url.searchParams.get("error");
    if (connected) {
      toast({ title: "Mailbox connected", description: `Linked ${connected} account.` });
      url.searchParams.delete("connected");
      window.history.replaceState({}, "", url.toString());
    } else if (errorCode) {
      toast({
        title: "Connection failed",
        description: errorCode.replace(/_/g, " "),
        variant: "destructive",
      });
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [isAuthenticated, toast]);

  const handleConnect = (provider: EmailProviderId) => {
    window.location.href = emailIntegrationService.connectUrl(provider);
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm("Disconnect this mailbox? Synced messages stay; new emails will stop arriving.")) return;
    await emailIntegrationService.disconnect(id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    toast({ title: "Mailbox disconnected" });
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const result = await emailIntegrationService.syncNow();
      const total = result.summaries.reduce((acc, s) => acc + s.messagesSynced, 0);
      toast({
        title: "Sync complete",
        description: `${total} message${total === 1 ? "" : "s"} synced across ${result.accounts} mailbox${result.accounts === 1 ? "" : "es"}.`,
      });
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
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-sm text-muted-foreground">No mailboxes connected yet.</div>
          ) : (
            <div className="space-y-2">
              {accounts.map((a) => (
                <AccountRow key={a.id} account={a} onDisconnect={handleDisconnect} />
              ))}
            </div>
          )}
          <Separator />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => handleConnect("gmail")}>
              <Plus className="h-4 w-4 mr-1" /> Connect Gmail
            </Button>
            <Button variant="outline" onClick={() => handleConnect("outlook")}>
              <Plus className="h-4 w-4 mr-1" /> Connect Outlook
            </Button>
            {accounts.length > 0 && (
              <Button onClick={handleSyncNow} disabled={syncing}>
                <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} /> Sync now
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <RulesEditor rules={rules} setRules={setRules} />

      <SyncHistory runs={runs} />
    </div>
  );
}

interface AccountRowProps {
  account: ConnectedEmailAccount;
  onDisconnect: (id: string) => void;
}

function AccountRow({ account, onDisconnect }: AccountRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 border rounded p-3">
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

interface RulesEditorProps {
  rules: EmailUserRule[];
  setRules: React.Dispatch<React.SetStateAction<EmailUserRule[]>>;
}

const EMPTY_DRAFT: Pick<EmailUserRule, "name" | "conditions" | "actionCategory" | "actionScore" | "isEnabled" | "priority"> = {
  name: "",
  conditions: [{ field: "from_domain", op: "contains", value: "" }],
  actionCategory: "job_opportunity",
  actionScore: 1,
  isEnabled: true,
  priority: 50,
};

function RulesEditor({ rules, setRules }: RulesEditorProps) {
  const [draft, setDraft] = useState<typeof EMPTY_DRAFT>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const handleAdd = async () => {
    if (!draft.name.trim() || draft.conditions.length === 0 || !draft.conditions[0].value.trim()) {
      toast({ title: "Rule incomplete", description: "Name and at least one condition are required.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const created = await emailIntegrationService.createRule(draft);
      setRules((prev) => [...prev, created]);
      setDraft(EMPTY_DRAFT);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    await emailIntegrationService.deleteRule(id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleToggle = async (id: string, isEnabled: boolean) => {
    await emailIntegrationService.patchRule(id, { isEnabled });
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, isEnabled } : r)));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Classification Rules</CardTitle>
        <CardDescription>
          User rules run before the AI classifier. Add rules to mark obvious senders or override the
          default categorisation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rules.length === 0 ? (
          <div className="text-sm text-muted-foreground">No custom rules yet.</div>
        ) : (
          rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border rounded p-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  → {r.actionCategory} (score {Number(r.actionScore).toFixed(2)}, priority {r.priority})
                </div>
              </div>
              <Switch checked={r.isEnabled} onCheckedChange={(v) => handleToggle(r.id, v)} />
              <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}

        <Separator />

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide">Add rule</Label>
          <Input
            placeholder="Rule name (e.g. Mark recruiter@acme.com as recruiter outreach)"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-2">
            <Select
              value={draft.conditions[0].field}
              onValueChange={(v) =>
                setDraft({
                  ...draft,
                  conditions: [{ ...draft.conditions[0], field: v as any }],
                })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select
              value={draft.conditions[0].op}
              onValueChange={(v) =>
                setDraft({
                  ...draft,
                  conditions: [{ ...draft.conditions[0], op: v as any }],
                })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_OPS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="value"
              value={draft.conditions[0].value}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  conditions: [{ ...draft.conditions[0], value: e.target.value }],
                })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={draft.actionCategory}
              onValueChange={(v) => setDraft({ ...draft, actionCategory: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={handleAdd} disabled={busy}>
              <Plus className="h-4 w-4 mr-1" /> Add rule
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
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

export default EmailIntegrationsSection;
