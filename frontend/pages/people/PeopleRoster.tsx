import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS } from "@shared/employment-types";
import { EMPLOYEE_STATUSES, EMPLOYEE_STATUS_LABELS } from "@shared/people-ops";
import {
  peopleApi,
  employeeName,
  employeeIdentityKind,
  type Employee,
  type EmployeeWrite,
  type EmployeeIdentityKind,
  type OrgNode,
  type TeamMetrics,
} from "@/lib/people-ops/api";
import { Users, UserPlus, Building2, Star, CalendarClock, CreditCard } from "lucide-react";

const IDENTITY_LABEL: Record<EmployeeIdentityKind, string> = {
  member: "Member",
  invited: "Invited",
  external: "External",
  placeholder: "Placeholder",
};

function IdentityBadge({ employee }: { employee: Employee }) {
  const kind = employeeIdentityKind(employee);
  // Members are billable seats; everyone else is visible-but-not-billable.
  const variant = kind === "member" ? "default" : "secondary";
  return (
    <Badge variant={variant} title={employee.billable ? "Billable seat" : "Not billable"}>
      {IDENTITY_LABEL[kind]}
    </Badge>
  );
}

const EMPTY_FORM: EmployeeWrite = {
  firstName: "",
  lastName: "",
  email: "",
  position: "",
  department: "",
  employmentType: "full-time",
  status: "active",
  managerId: null,
};

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="text-primary">{icon}</div>
        <div>
          <p className="text-2xl font-semibold leading-none">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function OrgTree({ nodes, depth = 0 }: { nodes: OrgNode[]; depth?: number }) {
  if (nodes.length === 0) return null;
  return (
    <ul className={depth === 0 ? "space-y-2" : "ml-6 border-l pl-4 space-y-2 mt-2"}>
      {nodes.map((n) => (
        <li key={n.employee.id}>
          <div className="flex items-center gap-2">
            <span className="font-medium">{employeeName(n.employee)}</span>
            <span className="text-sm text-muted-foreground">{n.employee.position || "—"}</span>
            {n.employee.isFounder && <Badge variant="secondary">Founder</Badge>}
          </div>
          <OrgTree nodes={n.reports} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

export default function PeopleRoster() {
  useSEO("/people/roster");
  useBreadcrumbs([
    { name: "People Operations", url: "/people-operations" },
    { name: "Roster", url: "/people/roster" },
  ]);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tree, setTree] = useState<OrgNode[]>([]);
  const [metrics, setMetrics] = useState<TeamMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeWrite>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUpgradeRequired(false);
    try {
      const [emps, hierarchy, m] = await Promise.all([
        peopleApi.listEmployees(),
        peopleApi.hierarchy(),
        peopleApi.teamMetrics(),
      ]);
      setEmployees(emps);
      setTree(hierarchy);
      setMetrics(m);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load roster";
      if (/paid|upgrade/i.test(msg)) setUpgradeRequired(true);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      [e.firstName, e.lastName, e.position, e.department, ...e.skills].join(" ").toLowerCase().includes(q),
    );
  }, [employees, search]);

  const managerName = useCallback(
    (id: string | null) => {
      if (!id) return "—";
      const m = employees.find((e) => e.id === id);
      return m ? employeeName(m) : "—";
    },
    [employees],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (e: Employee) => {
    setEditing(e);
    setForm({
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      position: e.position,
      department: e.department,
      employmentType: e.employmentType,
      status: e.status,
      managerId: e.managerId,
      salary: e.salary ?? undefined,
      isFounder: e.isFounder,
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setFormError(null);
    try {
      if (editing) await peopleApi.updateEmployee(editing.id, form);
      else await peopleApi.createEmployee(form);
      setDialogOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: Employee) => {
    if (!window.confirm(`Remove ${employeeName(e)} from the roster?`)) return;
    try {
      await peopleApi.deleteEmployee(e.id);
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (upgradeRequired) {
    return (
      <AppShell bgClassName="bg-background">
        <main className="px-6 py-16 max-w-2xl mx-auto text-center space-y-6">
          <Users className="h-12 w-12 mx-auto text-primary" />
          <h1 className="text-3xl font-bold">People Operations is a paid employer feature</h1>
          <p className="text-muted-foreground">
            Manage your roster, org chart, 1:1s, and team health on a paid company plan. Upgrade
            to unlock the full CHRO suite.
          </p>
          <div className="flex justify-center gap-3">
            <Button asChild>
              <Link to="/people-operations">See plans & features</Link>
            </Button>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-background">
      <main className="px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Corporate Roster</h1>
            <p className="text-muted-foreground">Your team directory and org chart — the spine of People Operations.</p>
          </div>
          <Button onClick={openCreate}>
            <UserPlus className="h-4 w-4 mr-2" /> Add employee
          </Button>
        </div>

        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <MetricCard icon={<Users className="h-5 w-5" />} label="Total headcount" value={String(metrics.totalHeadcount)} />
            <MetricCard icon={<Building2 className="h-5 w-5" />} label="Active" value={String(metrics.activeHeadcount)} />
            <MetricCard icon={<CreditCard className="h-5 w-5" />} label="Billable seats" value={String(metrics.billableSeats)} />
            <MetricCard
              icon={<Star className="h-5 w-5" />}
              label="Avg performance"
              value={metrics.avgPerformanceRating ? metrics.avgPerformanceRating.toFixed(1) : "—"}
            />
            <MetricCard icon={<CalendarClock className="h-5 w-5" />} label="Upcoming 1:1s" value={String(metrics.upcomingOneOnOnes)} />
          </div>
        )}

        <Tabs defaultValue="roster">
          <TabsList>
            <TabsTrigger value="roster">Roster</TabsTrigger>
            <TabsTrigger value="org">Org chart</TabsTrigger>
          </TabsList>

          <TabsContent value="roster" className="space-y-4">
            <Input
              placeholder="Search by name, role, department, or skill…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            {loading ? (
              <p className="text-muted-foreground">Loading roster…</p>
            ) : error ? (
              <p className="text-red-600">{error}</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground">No employees yet. Add your first team member.</p>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Manager</TableHead>
                      <TableHead>Identity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">
                          {employeeName(e)} {e.isFounder && <Badge variant="secondary" className="ml-1">Founder</Badge>}
                        </TableCell>
                        <TableCell>{e.position || "—"}</TableCell>
                        <TableCell>{e.department || "—"}</TableCell>
                        <TableCell>{managerName(e.managerId)}</TableCell>
                        <TableCell><IdentityBadge employee={e} /></TableCell>
                        <TableCell>
                          <Badge variant={e.status === "active" ? "default" : "secondary"}>
                            {EMPLOYEE_STATUS_LABELS[e.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(e)}>Edit</Button>
                          <Button variant="ghost" size="sm" onClick={() => remove(e)}>Remove</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="org">
            <Card>
              <CardHeader>
                <CardTitle>Organization chart</CardTitle>
              </CardHeader>
              <CardContent>
                {tree.length === 0 ? (
                  <p className="text-muted-foreground">No org structure yet. Assign managers to build the tree.</p>
                ) : (
                  <OrgTree nodes={tree} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit employee" : "Add employee"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>First name</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <Label>Last name</Label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Position</Label>
              <Input value={form.position ?? ""} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </div>
            <div>
              <Label>Department</Label>
              <Input value={form.department ?? ""} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
            <div>
              <Label>Employment type</Label>
              <Select
                value={form.employmentType}
                onValueChange={(v) => setForm({ ...form, employmentType: v as EmployeeWrite["employmentType"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{EMPLOYMENT_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as EmployeeWrite["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMPLOYEE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{EMPLOYEE_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Manager</Label>
              <Select
                value={form.managerId ?? "none"}
                onValueChange={(v) => setForm({ ...form, managerId: v === "none" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="No manager" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No manager</SelectItem>
                  {employees
                    .filter((e) => !editing || e.id !== editing.id)
                    .map((e) => (
                      <SelectItem key={e.id} value={e.id}>{employeeName(e)}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.firstName || !form.lastName || !form.email}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
