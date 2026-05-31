import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Building2, Search, ShieldOff, ShieldCheck, Plus, ExternalLink } from "lucide-react";

interface CompanyRow {
  id: string;
  name: string;
  slug: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  isActive: boolean;
  isVerified: boolean;
  embedEnabled: boolean;
  createdAt: string;
}
interface FeatureTree {
  company: { id: string; name: string; slug: string | null; isActive: boolean; isVerified: boolean; embedEnabled: boolean; featured: boolean };
  subscription: { planTier: string; status: string; seatCount: number; seatLimit: number; pricePerSeatCents: number } | null;
  tokenPool: { balance: number; lifetimeGranted: number; lifetimeConsumed: number } | null;
  seats: { activeMembers: number; employees: number };
  peopleOps: { segmentId: string; plan: string; status: string; employees: number } | null;
  integrations: { provider: string; status: string; lastSyncAt: string | null }[];
  embedding: { enabled: boolean; activeKeys: number };
  counts: { jobs: number; resumes: number };
}

const STATUSES = ["all", "active", "suspended", "verified", "unverified"] as const;
const BASE = "/api/admin/impersonate/companies";

export default function CompanyManagement() {
  const { toast } = useToast();
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [page, setPage] = useState(1);

  const [detail, setDetail] = useState<FeatureTree | null>(null);
  const [drill, setDrill] = useState<{ employees?: any; jobs?: any[]; resumes?: any[] }>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status, page: String(page), limit: "25" });
      if (search.trim()) params.set("search", search.trim());
      const res = await apiClient.get<{ companies: CompanyRow[]; total: number }>(`${BASE}?${params}`);
      setRows(res.data.companies);
      setTotal(res.data.total);
    } catch {
      toast({ title: "Couldn't load companies", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [search, status, page, toast]);

  useEffect(() => { void load(); }, [load]);

  const openDetail = async (id: string) => {
    try {
      const [tree, emp, jobs, resumes] = await Promise.all([
        apiClient.get<FeatureTree>(`${BASE}/${id}`),
        apiClient.get<any>(`${BASE}/${id}/employees`),
        apiClient.get<any[]>(`${BASE}/${id}/jobs`),
        apiClient.get<any[]>(`${BASE}/${id}/resumes`),
      ]);
      setDetail(tree.data);
      setDrill({ employees: emp.data, jobs: jobs.data, resumes: resumes.data });
    } catch {
      toast({ title: "Couldn't load company detail", variant: "destructive" });
    }
  };

  const patch = async (id: string, body: Record<string, boolean>) => {
    try {
      await apiClient.patch(`${BASE}/${id}`, body);
      await load();
      if (detail?.company.id === id) await openDetail(id);
      toast({ title: "Company updated" });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const create = async () => {
    if (!newName.trim()) return;
    try {
      await apiClient.post(BASE, { name: newName.trim() });
      setCreateOpen(false);
      setNewName("");
      await load();
      toast({ title: "Company created" });
    } catch {
      toast({ title: "Create failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6" /> Companies <span className="text-base font-normal text-muted-foreground">({total})</span></h1>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Create company</Button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 w-64" placeholder="Search name or slug…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <Button key={s} size="sm" variant={status === s ? "default" : "outline"}
              onClick={() => { setStatus(s); setPage(1); }}>{s}</Button>
          ))}
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Embed</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground">No companies.</TableCell></TableRow>
            ) : rows.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => openDetail(c.id)}>
                <TableCell>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.slug}</div>
                </TableCell>
                <TableCell className="text-sm">{c.ownerName ?? "—"}<div className="text-xs text-muted-foreground">{c.ownerEmail}</div></TableCell>
                <TableCell className="space-x-1">
                  <Badge variant={c.isActive ? "default" : "destructive"}>{c.isActive ? "Active" : "Suspended"}</Badge>
                  {c.isVerified && <Badge variant="secondary">Verified</Badge>}
                </TableCell>
                <TableCell>{c.embedEnabled ? <Badge variant="secondary">On</Badge> : "—"}</TableCell>
                <TableCell className="text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                  {c.isActive ? (
                    <Button size="sm" variant="ghost" title="Suspend (spam)" onClick={() => patch(c.id, { isActive: false })}>
                      <ShieldOff className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" title="Restore" onClick={() => patch(c.id, { isActive: true })}>
                      <ShieldCheck className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="flex justify-between items-center text-sm">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
        <span className="text-muted-foreground">Page {page}</span>
        <Button size="sm" variant="outline" disabled={page * 25 >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>

      {/* Detail / feature tree */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail.company.name}
                  <Badge variant={detail.company.isActive ? "default" : "destructive"}>{detail.company.isActive ? "Active" : "Suspended"}</Badge>
                  {detail.company.slug && (
                    <a href={`/companies/${detail.company.slug}`} target="_blank" rel="noreferrer" className="text-muted-foreground"><ExternalLink className="h-4 w-4" /></a>
                  )}
                </DialogTitle>
              </DialogHeader>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => patch(detail.company.id, { isActive: !detail.company.isActive })}>
                  {detail.company.isActive ? "Suspend (spam)" : "Restore"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => patch(detail.company.id, { isVerified: !detail.company.isVerified })}>
                  {detail.company.isVerified ? "Unverify" : "Verify"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => patch(detail.company.id, { embedEnabled: !detail.company.embedEnabled })}>
                  {detail.company.embedEnabled ? "Disable embed" : "Enable embed"}
                </Button>
              </div>

              <Tabs defaultValue="features" className="mt-2">
                <TabsList>
                  <TabsTrigger value="features">Features</TabsTrigger>
                  <TabsTrigger value="employees">Employees</TabsTrigger>
                  <TabsTrigger value="jobs">Jobs</TabsTrigger>
                  <TabsTrigger value="resumes">Resumes</TabsTrigger>
                </TabsList>

                <TabsContent value="features" className="space-y-2 text-sm">
                  <FeatureRow label="Subscription" value={detail.subscription ? `${detail.subscription.planTier} · ${detail.subscription.status} · ${detail.subscription.seatCount}/${detail.subscription.seatLimit} seats @ $${(detail.subscription.pricePerSeatCents/100).toFixed(2)}` : "None"} />
                  <FeatureRow label="AI token pool" value={detail.tokenPool ? `${detail.tokenPool.balance.toLocaleString()} balance · ${detail.tokenPool.lifetimeConsumed.toLocaleString()} consumed` : "None"} />
                  <FeatureRow label="Seats (members / employees)" value={`${detail.seats.activeMembers} / ${detail.seats.employees}`} />
                  <FeatureRow label="People Ops (CHRO)" value={detail.peopleOps ? `${detail.peopleOps.plan} · ${detail.peopleOps.status} · ${detail.peopleOps.employees} roster` : "Not provisioned"} />
                  <FeatureRow label="Embedding" value={detail.embedding.enabled ? `Enabled · ${detail.embedding.activeKeys} active key(s)` : "Disabled"} />
                  <FeatureRow label="Integrations" value={detail.integrations.length ? detail.integrations.map((i) => `${i.provider} (${i.status})`).join(", ") : "None"} />
                  <FeatureRow label="Jobs / Resumes" value={`${detail.counts.jobs} / ${detail.counts.resumes}`} />
                </TabsContent>

                <TabsContent value="employees" className="text-sm space-y-2">
                  <p className="text-muted-foreground">{drill.employees?.members?.length ?? 0} members · {drill.employees?.roster?.length ?? 0} roster rows</p>
                  {(drill.employees?.members ?? []).map((m: any, i: number) => (
                    <div key={i} className="flex justify-between border-b py-1">
                      <span>{m.name ?? m.email ?? m.userId}</span>
                      <Badge variant="secondary">{m.role}{m.isActive ? "" : " (inactive)"}</Badge>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="jobs" className="text-sm space-y-1">
                  {(drill.jobs ?? []).length === 0 ? <p className="text-muted-foreground">No jobs.</p> :
                    (drill.jobs ?? []).map((j: any) => (
                      <div key={j.id} className="flex justify-between border-b py-1">
                        <span>{j.title}</span>{!j.isActive && <Badge variant="secondary">inactive</Badge>}
                      </div>
                    ))}
                </TabsContent>

                <TabsContent value="resumes" className="text-sm">
                  <p className="text-muted-foreground">{(drill.resumes ?? []).length} resume(s) attached to this company.</p>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create company</DialogTitle></DialogHeader>
          <Input placeholder="Company name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <p className="text-xs text-muted-foreground">You'll be set as the owner. Reassign the owner later if needed.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={!newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FeatureRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
