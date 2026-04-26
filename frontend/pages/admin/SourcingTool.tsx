import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Loader2,
  ShieldAlert,
  Sparkles,
  GitBranch,
  Users as UsersIcon,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Database,
  Trash2,
} from "lucide-react";
import { useAdminPermissions } from "@/lib/admin-permissions";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

interface ResolveOutcome {
  status: "cache_hit" | "cache_miss_resolved" | "not_found" | "suppressed" | "no_providers";
  result: {
    found: boolean;
    fullName?: string;
    email?: string;
    linkedinUrl?: string;
    githubLogin?: string;
    title?: string;
    company?: string;
    location?: string;
    countryCode?: string;
  } | null;
  integrationId: string | null;
  cacheRowId: string | null;
  costCents: number;
  cacheHit: boolean;
  durationMs: number;
}

interface PersonRow {
  id: string;
  fullName: string | null;
  primaryEmail: string | null;
  primaryLinkedinUrl: string | null;
  primaryGithubLogin: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  location: string | null;
  mergeStatus: "unclaimed" | "pending_review" | "merged" | "rejected_match";
  mergeCandidateUserId: string | null;
  mergeConfidence: number | null;
  mergeDetectedAt: string | null;
  linkedUserId: string | null;
  isRedacted: boolean;
  createdAt: string;
}

interface CandidateRow {
  userId: string;
  confidence: number;
  matchedIdentifiers: { type: string; value: string }[];
  user: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
}

interface PersonDetail {
  person: PersonRow;
  identifiers: { id: string; identifierType: string; identifierValue: string; isVerified: boolean }[];
  sources: { id: string; integrationId: string; payload: unknown; fetchedAt: string; staleAt: string | null }[];
  log: { id: string; action: string; confidence: number | null; createdAt: string; notes: string | null; candidateUserId: string | null }[];
  candidates: CandidateRow[];
}

const STATUS_BADGE: Record<string, string> = {
  cache_hit:           "bg-green-100 text-green-800",
  cache_miss_resolved: "bg-blue-100 text-blue-800",
  not_found:           "bg-gray-100 text-gray-700",
  suppressed:          "bg-red-100 text-red-800",
  no_providers:        "bg-amber-100 text-amber-800",
};

const MERGE_STATUS_BADGE: Record<string, string> = {
  unclaimed:       "bg-gray-100 text-gray-700",
  pending_review:  "bg-amber-100 text-amber-800",
  merged:          "bg-green-100 text-green-800",
  rejected_match:  "bg-red-100 text-red-800",
};

export default function SourcingTool() {
  const { canAccess } = useAdminPermissions();
  const { toast } = useToast();
  const [tab, setTab] = useState<"lookup" | "reconcile">("lookup");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search className="h-6 w-6" />
            Sourcing Tool
          </h1>
          <p className="text-muted-foreground mt-1">
            Cache-first lookup against enabled providers, plus the
            reconciliation merge tool for when sourced people sign up as users.
          </p>
        </div>
        <Link to="/admin/integrations">
          <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1.5" /> Back to integrations</Button>
        </Link>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof tab); setSelectedId(null); }}>
        <TabsList>
          <TabsTrigger value="lookup">Lookup</TabsTrigger>
          <TabsTrigger value="reconcile">Reconciliation / Merge</TabsTrigger>
        </TabsList>
        <TabsContent value="lookup" className="mt-6">
          <LookupTab toast={toast} />
        </TabsContent>
        <TabsContent value="reconcile" className="mt-6">
          {selectedId ? (
            <PersonReviewPane id={selectedId} onBack={() => setSelectedId(null)} toast={toast} />
          ) : (
            <ReconcileListPane onSelect={setSelectedId} toast={toast} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LookupTab({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  type Kind = "email" | "linkedin_url" | "github_login" | "name_company" | "domain";
  const [kind, setKind] = useState<Kind>("email");
  const [value, setValue] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ResolveOutcome | null>(null);

  const submit = async () => {
    setBusy(true);
    setOutcome(null);
    try {
      const body: Record<string, unknown> =
        kind === "name_company" ? { kind, name, company } : { kind, value };
      const res = await apiClient.post<ResolveOutcome>("/api/admin/integrations/lookup", body);
      setOutcome(res.data);
    } catch (err) {
      toast({ title: "Lookup failed", description: String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run a lookup</CardTitle>
          <CardDescription>
            Cache-first. Cache hits cost $0. Cache miss falls through to the
            cheapest enabled, capable provider.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Query kind</Label>
            <select
              className="w-full border rounded px-2 py-1.5 text-sm bg-background"
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
            >
              <option value="email">email</option>
              <option value="linkedin_url">linkedin_url</option>
              <option value="github_login">github_login</option>
              <option value="name_company">name + company</option>
              <option value="domain">domain</option>
            </select>
          </div>
          {kind === "name_company" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Full name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
              </div>
              <div>
                <Label className="text-xs">Company</Label>
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc" />
              </div>
            </div>
          ) : (
            <div>
              <Label className="text-xs">Value</Label>
              <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={
                kind === "email" ? "person@example.com" :
                kind === "linkedin_url" ? "https://www.linkedin.com/in/..." :
                kind === "github_login" ? "octocat" :
                "example.com"
              } />
            </div>
          )}
          <Button onClick={submit} disabled={busy} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
            Look up
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Result</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {!outcome && <p className="text-muted-foreground">Run a lookup to see the result.</p>}
          {outcome && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <Badge className={STATUS_BADGE[outcome.status]}>{outcome.status}</Badge>
                {outcome.cacheHit && <Badge variant="outline">Cache hit</Badge>}
                <Badge variant="outline">${(outcome.costCents / 100).toFixed(2)}</Badge>
                <Badge variant="outline">{outcome.durationMs}ms</Badge>
              </div>
              {outcome.result?.found && (
                <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                  <Field label="Name" value={outcome.result.fullName} />
                  <Field label="Email" value={outcome.result.email} />
                  <Field label="LinkedIn" value={outcome.result.linkedinUrl} />
                  <Field label="GitHub" value={outcome.result.githubLogin} />
                  <Field label="Title" value={outcome.result.title} />
                  <Field label="Company" value={outcome.result.company} />
                  <Field label="Location" value={outcome.result.location} />
                  <Field label="Country" value={outcome.result.countryCode} />
                </dl>
              )}
              {outcome.status === "suppressed" && (
                <p className="text-red-700 text-sm">This identifier is on the suppression list and was not looked up.</p>
              )}
              {outcome.status === "no_providers" && (
                <p className="text-amber-700 text-sm">No enabled provider claims to support this query kind. Enable one in <Link to="/admin/integrations" className="underline">Integrations</Link>.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-muted-foreground col-span-1">{label}</dt>
      <dd className="col-span-2 truncate" title={value ?? undefined}>{value || "—"}</dd>
    </>
  );
}

// ---------------------------------------------------------------------------

function ReconcileListPane({
  onSelect,
  toast,
}: {
  onSelect: (id: string) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [status, setStatus] = useState<PersonRow["mergeStatus"] | "all">("pending_review");
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const url = status === "all" ? "/api/admin/integrations/people" : `/api/admin/integrations/people?status=${status}`;
    const res = await apiClient.get<PersonRow[]>(url);
    setRows(res.data);
  }, [status]);

  useEffect(() => {
    load().catch((err) => toast({ title: "Load failed", description: String(err), variant: "destructive" }));
  }, [load, toast]);

  const runReconcile = async () => {
    setRunning(true);
    try {
      const res = await apiClient.post<{ scanned: number; flagged: number }>("/api/admin/integrations/reconcile/run");
      toast({ title: `Scanned ${res.data.scanned}, flagged ${res.data.flagged}` });
      await load();
    } catch (err) {
      toast({ title: "Reconciliation failed", description: String(err), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="h-4 w-4" /> Reconciliation
          </CardTitle>
          <CardDescription>
            When a sourced person signs up as a real user, two records exist —
            sourced X and user X. Run the reconciliation pass to detect matches
            (by email / LinkedIn / GitHub), then merge or reject each candidate.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-xs">Filter by status</Label>
            <select
              className="border rounded px-2 py-1.5 text-sm bg-background"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="pending_review">pending_review</option>
              <option value="unclaimed">unclaimed</option>
              <option value="merged">merged</option>
              <option value="rejected_match">rejected_match</option>
              <option value="all">all</option>
            </select>
          </div>
          <Button onClick={runReconcile} disabled={running} variant="outline" size="sm">
            {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Run reconciliation pass
          </Button>
        </CardContent>
      </Card>

      {!rows ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          <Database className="h-6 w-6 mx-auto opacity-40 mb-2" />
          No sourced people for this filter.
        </CardContent></Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Email</th>
                <th className="text-left p-2">Title @ Company</th>
                <th className="text-left p-2">Status</th>
                <th className="text-right p-2">Confidence</th>
                <th className="text-right p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 truncate max-w-[200px]">
                    {r.isRedacted ? <span className="italic text-muted-foreground">redacted</span> : (r.fullName ?? "—")}
                  </td>
                  <td className="p-2 truncate max-w-[200px]">{r.primaryEmail ?? "—"}</td>
                  <td className="p-2 truncate max-w-[260px] text-muted-foreground">
                    {r.currentTitle && r.currentCompany ? `${r.currentTitle} @ ${r.currentCompany}` : (r.currentTitle ?? r.currentCompany ?? "—")}
                  </td>
                  <td className="p-2">
                    <Badge className={MERGE_STATUS_BADGE[r.mergeStatus]}>{r.mergeStatus}</Badge>
                  </td>
                  <td className="p-2 text-right">{r.mergeConfidence ?? "—"}</td>
                  <td className="p-2 text-right">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onSelect(r.id)}>
                      Review
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PersonReviewPane({
  id,
  onBack,
  toast,
}: {
  id: string;
  onBack: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await apiClient.get<PersonDetail>(`/api/admin/integrations/people/${id}`);
    setDetail(res.data);
  }, [id]);

  useEffect(() => {
    load().catch((err) => toast({ title: "Load failed", description: String(err), variant: "destructive" }));
  }, [load, toast]);

  if (!detail) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const { person, identifiers, candidates, log, sources } = detail;

  const merge = async (userId: string) => {
    if (!window.confirm(`Merge this sourced row into the user account? This sets linked_user_id and hides the row from sourcing pools.`)) return;
    setBusy(true);
    try {
      await apiClient.post(`/api/admin/integrations/people/${id}/merge`, { userId });
      await load();
      toast({ title: "Merged" });
    } catch (err) {
      toast({ title: "Merge failed", description: String(err), variant: "destructive" });
    } finally { setBusy(false); }
  };
  const reject = async () => {
    setBusy(true);
    try {
      await apiClient.post(`/api/admin/integrations/people/${id}/reject-merge`, {});
      await load();
      toast({ title: "Match rejected" });
    } catch (err) {
      toast({ title: "Reject failed", description: String(err), variant: "destructive" });
    } finally { setBusy(false); }
  };
  const unmerge = async () => {
    if (!window.confirm("Unmerge this row? It will return to 'unclaimed' status.")) return;
    setBusy(true);
    try {
      await apiClient.post(`/api/admin/integrations/people/${id}/unmerge`, {});
      await load();
      toast({ title: "Unmerged" });
    } catch (err) {
      toast({ title: "Unmerge failed", description: String(err), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to list
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>{person.isRedacted ? <span className="italic">redacted</span> : (person.fullName ?? "Unnamed sourced person")}</span>
            <Badge className={MERGE_STATUS_BADGE[person.mergeStatus]}>{person.mergeStatus}</Badge>
          </CardTitle>
          {person.linkedUserId && (
            <CardDescription>
              Linked to user <code>{person.linkedUserId}</code>
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
            <Field label="Email" value={person.primaryEmail} />
            <Field label="LinkedIn" value={person.primaryLinkedinUrl} />
            <Field label="GitHub" value={person.primaryGithubLogin} />
            <Field label="Title" value={person.currentTitle} />
            <Field label="Company" value={person.currentCompany} />
            <Field label="Location" value={person.location} />
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {identifiers.map((i) => (
              <span key={i.id} className="text-[10px] uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded">
                {i.identifierType}: {i.identifierValue}
              </span>
            ))}
          </div>
          {person.mergeStatus === "merged" && (
            <div className="mt-4">
              <Button variant="outline" size="sm" onClick={unmerge} disabled={busy}>
                <RotateCcw className="h-4 w-4 mr-1.5" /> Unmerge
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UsersIcon className="h-4 w-4" /> User candidates ({candidates.length})
          </CardTitle>
          <CardDescription>
            Confidence ≥ 90 = strong match (3 identifiers). 60-89 = strong single match. 50-59 = soft match — review carefully.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching users found by email / LinkedIn / GitHub.</p>
          ) : (
            <div className="space-y-2">
              {candidates.map((cand) => (
                <div key={cand.userId} className="border rounded p-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      {cand.user
                        ? [cand.user.firstName, cand.user.lastName].filter(Boolean).join(" ") || cand.user.email
                        : cand.userId}
                    </div>
                    <div className="text-xs text-muted-foreground">{cand.user?.email}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {cand.matchedIdentifiers.map((m) => (
                        <Badge key={`${m.type}:${m.value}`} variant="outline" className="text-[10px]">
                          {m.type}: {m.value}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-2xl font-bold">{cand.confidence}</div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        disabled={busy || person.mergeStatus === "merged"}
                        onClick={() => merge(cand.userId)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1.5" /> Merge
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {person.mergeStatus === "pending_review" && (
                <div className="pt-2">
                  <Button variant="ghost" size="sm" className="text-red-600" onClick={reject} disabled={busy}>
                    <XCircle className="h-4 w-4 mr-1.5" /> Reject all candidates
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Source provenance ({sources.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No source records.</p>
          ) : (
            <ul className="text-xs space-y-1">
              {sources.map((s) => (
                <li key={s.id} className="font-mono">
                  {new Date(s.fetchedAt).toISOString()} · integration <code>{s.integrationId.slice(0, 8)}</code>
                  {s.staleAt && ` · stale ${new Date(s.staleAt).toLocaleDateString()}`}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Audit log ({log.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">No log entries.</p>
          ) : (
            <ul className="text-xs space-y-1">
              {log.map((l) => (
                <li key={l.id} className="font-mono">
                  {new Date(l.createdAt).toISOString()} · {l.action}
                  {l.confidence != null && ` · conf ${l.confidence}`}
                  {l.candidateUserId && ` · user ${l.candidateUserId.slice(0, 8)}`}
                  {l.notes && ` · ${l.notes}`}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
