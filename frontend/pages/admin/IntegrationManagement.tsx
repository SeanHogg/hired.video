import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Plug,
  Loader2,
  ShieldAlert,
  Check,
  X,
  ExternalLink,
  KeyRound,
  Activity,
  AlertCircle,
  Sparkles,
  Search as SearchIcon,
} from "lucide-react";
import { useAdminPermissions } from "@/lib/admin-permissions";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface IntegrationRow {
  id: string;
  slug: string;
  displayName: string;
  kind: "system" | "creator";
  category: string;
  pricingModel: "free" | "paid" | "freemium";
  costPerCallCents: number;
  description: string | null;
  homepageUrl: string | null;
  docsUrl: string | null;
  enabled: boolean;
  reviewStatus: "approved" | "pending" | "rejected";
  rejectionReason: string | null;
  capabilities: Record<string, boolean>;
  credentialEnvVar: string | null;
  credentialsResolved: boolean;
  provider: boolean; // whether a code-side provider matches the slug
  stats7d: {
    total: number;
    successes: number;
    errors: number;
    spend: number;
    cacheHits: number;
  };
  ownerUserId: string | null;
}

interface RunRow {
  id: string;
  integrationId: string;
  status: string;
  kind: string;
  costCents: number;
  cacheHit: boolean;
  errorMessage: string | null;
  durationMs: number;
  createdAt: string;
}

interface DsrRow {
  id: string;
  requestType: string;
  subjectEmail: string;
  status: string;
  jurisdiction: string | null;
  createdAt: string;
  resultSummary: string | null;
}

interface SuppressionRow {
  id: string;
  identifierType: string;
  identifierValue: string;
  reason: string;
  notes: string | null;
  createdAt: string;
}

const PRICING_BADGE: Record<string, string> = {
  free:     "bg-green-100 text-green-800",
  freemium: "bg-blue-100 text-blue-800",
  paid:     "bg-amber-100 text-amber-800",
};

const STATUS_BADGE: Record<string, string> = {
  approved: "bg-green-100 text-green-800",
  pending:  "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-800",
};

export default function IntegrationManagement() {
  const { canAccess, can } = useAdminPermissions();
  const { toast } = useToast();
  const [tab, setTab] = useState<"providers" | "runs" | "dsr" | "suppression">("providers");

  if (!canAccess("integrations")) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-8">
        <ShieldAlert className="h-5 w-5" />
        <span>You don&apos;t have access to integrations.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Plug className="h-6 w-6" />
          Integrations
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage system + creator integrations, sourcing telemetry, GDPR data
          subject requests, and the suppression list.
        </p>
        <div className="mt-3 flex gap-2">
          <Link to="/admin/integrations/sourcing">
            <Button variant="outline" size="sm">
              <SearchIcon className="h-4 w-4 mr-1.5" /> Open Sourcing Tool
            </Button>
          </Link>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="runs">Recent Runs</TabsTrigger>
          <TabsTrigger value="dsr">Data Subject Requests</TabsTrigger>
          <TabsTrigger value="suppression">Suppression List</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="mt-6">
          <ProvidersTab canEdit={can("integrations", "update")} toast={toast} />
        </TabsContent>
        <TabsContent value="runs" className="mt-6">
          <RunsTab />
        </TabsContent>
        <TabsContent value="dsr" className="mt-6">
          <DsrTab canProcess={can("integrations", "update")} toast={toast} />
        </TabsContent>
        <TabsContent value="suppression" className="mt-6">
          <SuppressionTab canEdit={can("integrations", "update")} toast={toast} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ProvidersTab({ canEdit, toast }: { canEdit: boolean; toast: ReturnType<typeof useToast>["toast"] }) {
  const [rows, setRows] = useState<IntegrationRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiClient.get<IntegrationRow[]>("/api/admin/integrations");
    setRows(res.data);
  }, []);

  useEffect(() => {
    load().catch((err) => {
      toast({ title: "Failed to load integrations", description: String(err), variant: "destructive" });
    });
  }, [load, toast]);

  const toggle = async (row: IntegrationRow) => {
    setBusy(row.id);
    try {
      const path = row.enabled ? "disable" : "enable";
      await apiClient.post(`/api/admin/integrations/${row.id}/${path}`);
      await load();
      toast({ title: `${row.displayName} ${row.enabled ? "disabled" : "enabled"}` });
    } catch (err) {
      toast({ title: "Failed", description: String(err), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (!rows) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const system = rows.filter((r) => r.kind === "system");
  const creator = rows.filter((r) => r.kind === "creator");

  return (
    <div className="space-y-8">
      <ProviderSection
        title="System integrations"
        subtitle="Ship with the platform. SuperAdmin enables/disables and supplies API keys."
        rows={system}
        canEdit={canEdit}
        busy={busy}
        onToggle={toggle}
        onSaved={load}
        toast={toast}
      />
      <ProviderSection
        title="Creator integrations"
        subtitle="Submitted by creators via /api/creators/integrations. Approve or reject each one."
        rows={creator}
        canEdit={canEdit}
        busy={busy}
        onToggle={toggle}
        onSaved={load}
        toast={toast}
        showReview
      />
    </div>
  );
}

function ProviderSection({
  title,
  subtitle,
  rows,
  canEdit,
  busy,
  onToggle,
  onSaved,
  toast,
  showReview,
}: {
  title: string;
  subtitle: string;
  rows: IntegrationRow[];
  canEdit: boolean;
  busy: string | null;
  onToggle: (r: IntegrationRow) => void;
  onSaved: () => Promise<void>;
  toast: ReturnType<typeof useToast>["toast"];
  showReview?: boolean;
}) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No integrations.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((r) => (
            <Card key={r.id} className={!r.enabled ? "opacity-80" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {r.displayName}
                      {!r.provider && r.kind === "system" && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <AlertCircle className="h-3 w-3" /> No provider class
                        </Badge>
                      )}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">slug: <code>{r.slug}</code> · {r.category}</p>
                  </div>
                  <Switch
                    checked={r.enabled}
                    disabled={!canEdit || busy === r.id || r.reviewStatus !== "approved"}
                    onCheckedChange={() => onToggle(r)}
                    aria-label={r.enabled ? "Disable" : "Enable"}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {r.description && <p className="text-muted-foreground">{r.description}</p>}
                <div className="flex flex-wrap gap-2">
                  <Badge className={PRICING_BADGE[r.pricingModel]}>{r.pricingModel}</Badge>
                  {r.costPerCallCents > 0 && (
                    <Badge variant="outline">{(r.costPerCallCents / 100).toFixed(2)}¢ / call</Badge>
                  )}
                  <Badge className={STATUS_BADGE[r.reviewStatus]}>{r.reviewStatus}</Badge>
                  {r.credentialEnvVar && (
                    <Badge
                      variant="outline"
                      className={r.credentialsResolved ? "text-green-700" : "text-amber-700"}
                    >
                      {r.credentialsResolved ? <Check className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}
                      {r.credentialEnvVar}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(r.capabilities ?? {})
                    .filter(([, v]) => v === true)
                    .map(([k]) => (
                      <span key={k} className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {k}
                      </span>
                    ))}
                </div>
                <div className="text-xs text-muted-foreground flex gap-4 border-t pt-2">
                  <span>7d runs: <strong>{r.stats7d.total}</strong></span>
                  <span>cache hits: <strong>{r.stats7d.cacheHits}</strong></span>
                  <span>errors: <strong className={r.stats7d.errors > 0 ? "text-red-600" : ""}>{r.stats7d.errors}</strong></span>
                  <span>spend: <strong>${(r.stats7d.spend / 100).toFixed(2)}</strong></span>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {r.homepageUrl && (
                    <a href={r.homepageUrl} target="_blank" rel="noreferrer" className="text-xs underline flex items-center gap-1">
                      Site <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {r.docsUrl && (
                    <a href={r.docsUrl} target="_blank" rel="noreferrer" className="text-xs underline flex items-center gap-1">
                      Docs <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {canEdit && (
                    <CredentialDialog row={r} onSaved={onSaved} toast={toast} />
                  )}
                  {showReview && r.reviewStatus === "pending" && canEdit && (
                    <ReviewButtons row={r} onSaved={onSaved} toast={toast} />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CredentialDialog({
  row,
  onSaved,
  toast,
}: {
  row: IntegrationRow;
  onSaved: () => Promise<void>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [open, setOpen] = useState(false);
  const [envVar, setEnvVar] = useState(row.credentialEnvVar ?? `${row.slug.replace(/-/g, "_").toUpperCase()}_API_KEY`);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs">
          <KeyRound className="h-3.5 w-3.5 mr-1" /> Credentials
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row.displayName} credentials</DialogTitle>
          <DialogDescription>
            Reference the env-var name. The actual secret lives in Cloudflare
            secrets or your env — set it via <code>wrangler secret put {envVar}</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Env var name</Label>
            <Input value={envVar} onChange={(e) => setEnvVar(e.target.value)} placeholder="UPPER_SNAKE" />
            <p className="text-xs text-muted-foreground mt-1">
              {row.credentialsResolved ? "Currently resolves to a value." : "Currently NOT set in this environment."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await apiClient.put(`/api/admin/integrations/${row.id}/credentials`, { envVarName: envVar });
                await onSaved();
                setOpen(false);
                toast({ title: "Credential saved" });
              } catch (err) {
                toast({ title: "Save failed", description: String(err), variant: "destructive" });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewButtons({
  row,
  onSaved,
  toast,
}: {
  row: IntegrationRow;
  onSaved: () => Promise<void>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  return (
    <div className="flex gap-1">
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        disabled={busy !== null}
        onClick={async () => {
          setBusy("approve");
          try {
            await apiClient.post(`/api/admin/integrations/${row.id}/review`, { decision: "approve" });
            await onSaved();
            toast({ title: "Approved" });
          } catch (err) {
            toast({ title: "Approve failed", description: String(err), variant: "destructive" });
          } finally {
            setBusy(null);
          }
        }}
      >
        Approve
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs text-red-600"
        disabled={busy !== null}
        onClick={async () => {
          const reason = window.prompt("Rejection reason?") ?? "";
          if (!reason) return;
          setBusy("reject");
          try {
            await apiClient.post(`/api/admin/integrations/${row.id}/review`, { decision: "reject", rejectionReason: reason });
            await onSaved();
            toast({ title: "Rejected" });
          } catch (err) {
            toast({ title: "Reject failed", description: String(err), variant: "destructive" });
          } finally {
            setBusy(null);
          }
        }}
      >
        Reject
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RunsTab() {
  const [rows, setRows] = useState<RunRow[] | null>(null);

  useEffect(() => {
    apiClient.get<RunRow[]>("/api/admin/integrations/runs?limit=100").then((res) => setRows(res.data));
  }, []);

  if (!rows) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No sourcing runs yet. Try the <Link to="/admin/integrations/sourcing" className="underline">sourcing tool</Link>.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase">
          <tr>
            <th className="text-left p-2">When</th>
            <th className="text-left p-2">Status</th>
            <th className="text-left p-2">Kind</th>
            <th className="text-left p-2">Cache</th>
            <th className="text-right p-2">Cost</th>
            <th className="text-right p-2">Duration</th>
            <th className="text-left p-2">Error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
              <td className="p-2"><Badge variant="outline">{r.status}</Badge></td>
              <td className="p-2">{r.kind}</td>
              <td className="p-2">{r.cacheHit ? <Check className="h-3.5 w-3.5 text-green-600" /> : <X className="h-3.5 w-3.5 text-muted-foreground" />}</td>
              <td className="p-2 text-right">${(r.costCents / 100).toFixed(2)}</td>
              <td className="p-2 text-right">{r.durationMs}ms</td>
              <td className="p-2 text-red-700 truncate max-w-[260px]">{r.errorMessage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------

function DsrTab({ canProcess, toast }: { canProcess: boolean; toast: ReturnType<typeof useToast>["toast"] }) {
  const [rows, setRows] = useState<DsrRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiClient.get<DsrRow[]>("/api/admin/data-subject-requests");
    setRows(res.data);
  }, []);

  useEffect(() => {
    load().catch((err) => toast({ title: "Failed to load", description: String(err), variant: "destructive" }));
  }, [load, toast]);

  if (!rows) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        GDPR / CCPA data subject requests. Subjects submit via the public form; SuperAdmin processes here.
        Erasure requests redact matching <code>sourced_people</code> rows AND add the identifier to the
        suppression list so it can&apos;t be re-imported.
      </p>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="text-left p-2">Submitted</th>
              <th className="text-left p-2">Type</th>
              <th className="text-left p-2">Subject</th>
              <th className="text-left p-2">Jurisdiction</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Outcome</th>
              <th className="text-right p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="p-2"><Badge variant="outline">{r.requestType}</Badge></td>
                <td className="p-2 truncate max-w-[200px]">{r.subjectEmail}</td>
                <td className="p-2">{r.jurisdiction ?? "—"}</td>
                <td className="p-2"><Badge>{r.status}</Badge></td>
                <td className="p-2 text-xs text-muted-foreground truncate max-w-[260px]">{r.resultSummary ?? "—"}</td>
                <td className="p-2 text-right">
                  {canProcess && r.status !== "completed" && r.status !== "rejected" && (
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={busy === r.id}
                        onClick={async () => {
                          setBusy(r.id);
                          try {
                            await apiClient.post(`/api/admin/data-subject-requests/${r.id}/process`);
                            await load();
                            toast({ title: "Processed" });
                          } catch (err) {
                            toast({ title: "Process failed", description: String(err), variant: "destructive" });
                          } finally { setBusy(null); }
                        }}
                      >
                        Process
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-red-600"
                        disabled={busy === r.id}
                        onClick={async () => {
                          const reason = window.prompt("Rejection reason?") ?? "";
                          if (!reason) return;
                          setBusy(r.id);
                          try {
                            await apiClient.post(`/api/admin/data-subject-requests/${r.id}/reject`, { reason });
                            await load();
                            toast({ title: "Rejected" });
                          } catch (err) {
                            toast({ title: "Reject failed", description: String(err), variant: "destructive" });
                          } finally { setBusy(null); }
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">No requests yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SuppressionTab({ canEdit, toast }: { canEdit: boolean; toast: ReturnType<typeof useToast>["toast"] }) {
  const [rows, setRows] = useState<SuppressionRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ identifierType: "email", identifierValue: "", reason: "user_opt_out", notes: "" });

  const load = useCallback(async () => {
    const res = await apiClient.get<SuppressionRow[]>("/api/admin/suppression-list");
    setRows(res.data);
  }, []);

  useEffect(() => {
    load().catch((err) => toast({ title: "Failed to load", description: String(err), variant: "destructive" }));
  }, [load, toast]);

  if (!rows) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Identifiers in this list will never be sourced or imported. Erasure DSRs add entries automatically; you can also add manually for known opt-outs, bounces, or spam complaints.
      </p>
      {canEdit && (
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <div>
                <Label className="text-xs">Type</Label>
                <select
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                  value={form.identifierType}
                  onChange={(e) => setForm({ ...form, identifierType: e.target.value })}
                >
                  <option value="email">email</option>
                  <option value="domain">domain</option>
                  <option value="linkedin_url">linkedin_url</option>
                  <option value="github_login">github_login</option>
                  <option value="twitter_handle">twitter_handle</option>
                  <option value="phone_e164">phone_e164</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Value</Label>
                <Input value={form.identifierValue} onChange={(e) => setForm({ ...form, identifierValue: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Reason</Label>
                <select
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                >
                  <option value="user_opt_out">user_opt_out</option>
                  <option value="erasure_request">erasure_request</option>
                  <option value="admin_action">admin_action</option>
                  <option value="bounce">bounce</option>
                  <option value="spam_complaint">spam_complaint</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  className="w-full"
                  disabled={adding || !form.identifierValue}
                  onClick={async () => {
                    setAdding(true);
                    try {
                      await apiClient.post("/api/admin/suppression-list", form);
                      setForm({ identifierType: "email", identifierValue: "", reason: "user_opt_out", notes: "" });
                      await load();
                      toast({ title: "Added to suppression list" });
                    } catch (err) {
                      toast({ title: "Add failed", description: String(err), variant: "destructive" });
                    } finally { setAdding(false); }
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="text-left p-2">Added</th>
              <th className="text-left p-2">Type</th>
              <th className="text-left p-2">Value</th>
              <th className="text-left p-2">Reason</th>
              <th className="text-right p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="p-2"><Badge variant="outline">{r.identifierType}</Badge></td>
                <td className="p-2 truncate max-w-[260px]">{r.identifierValue}</td>
                <td className="p-2">{r.reason}</td>
                <td className="p-2 text-right">
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={async () => {
                        if (!window.confirm("Remove from suppression list?")) return;
                        await apiClient.delete(`/api/admin/suppression-list/${r.id}`);
                        await load();
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">Empty.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
