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
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { GOAL_STATUSES, GOAL_STATUS_LABELS, GOAL_PRIORITIES } from "@shared/people-ops";
import {
  peopleApi, employeeName,
  type Employee, type Goal, type GoalWrite,
} from "@/lib/people-ops/api";
import { Target, Plus, Users } from "lucide-react";

export default function PeopleGoals() {
  useSEO("/people/goals");
  useBreadcrumbs([
    { name: "People Operations", url: "/people-operations" },
    { name: "Goals & OKRs", url: "/people/goals" },
  ]);

  const [goals, setGoals] = useState<Goal[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<GoalWrite>({ employeeId: "", title: "", priority: "medium" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUpgradeRequired(false);
    try {
      const [g, emps] = await Promise.all([peopleApi.listGoals(), peopleApi.listEmployees()]);
      setGoals(g);
      setEmployees(emps);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load goals";
      if (/paid|upgrade/i.test(msg)) setUpgradeRequired(true);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const empName = useMemo(() => {
    const m = new Map(employees.map((e) => [e.id, employeeName(e)]));
    return (id: string) => m.get(id) ?? "—";
  }, [employees]);

  const create = async () => {
    setSaving(true);
    setFormError(null);
    try {
      await peopleApi.createGoal(form);
      setOpen(false);
      setForm({ employeeId: "", title: "", priority: "medium" });
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not create the goal");
    } finally {
      setSaving(false);
    }
  };

  if (upgradeRequired) {
    return (
      <AppShell bgClassName="bg-background">
        <main className="px-6 py-16 max-w-2xl mx-auto text-center space-y-6">
          <Target className="h-12 w-12 mx-auto text-primary" />
          <h1 className="text-3xl font-bold">People Operations is a paid employer feature</h1>
          <p className="text-muted-foreground">Track company → team → individual OKRs on a paid company plan.</p>
          <Button asChild><Link to="/people-operations">See plans &amp; features</Link></Button>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-background">
      <main className="px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Goals &amp; OKRs</h1>
            <p className="text-muted-foreground">Track objectives and key results across the team — progress rolls up automatically.</p>
          </div>
          <Button onClick={() => setOpen(true)} disabled={employees.length === 0}>
            <Plus className="h-4 w-4 mr-2" /> New goal
          </Button>
        </div>

        {employees.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Add people to the <Link to="/people/roster" className="underline">roster</Link> first to assign goals.
          </p>
        )}

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : goals.length === 0 ? (
          <p className="text-muted-foreground">No goals yet.</p>
        ) : (
          <div className="grid gap-3">
            {goals.map((g) => (
              <Card key={g.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {g.title}
                    {g.atRisk && <Badge variant="destructive">At risk</Badge>}
                    <Badge variant="secondary" className="ml-auto">{GOAL_STATUS_LABELS[g.status]}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm text-muted-foreground">Owner: {empName(g.employeeId)} · {g.priority}{g.dueDate ? ` · due ${new Date(g.dueDate).toLocaleDateString()}` : ""}</div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                      <div className={`h-2 ${g.atRisk ? "bg-red-600" : "bg-primary"}`} style={{ width: `${g.progress}%` }} />
                    </div>
                    <span className="text-sm tabular-nums w-10 text-right">{g.progress}%</span>
                  </div>
                  {g.keyResults.length > 0 && (
                    <ul className="text-sm text-muted-foreground list-disc ml-5">
                      {g.keyResults.map((kr) => (
                        <li key={kr.id}>{kr.description} — {kr.progress}%</li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New goal</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Owner</Label>
              <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{employeeName(e)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Grow MRR to $50k" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status ?? "not_started"} onValueChange={(v) => setForm({ ...form, status: v as GoalWrite["status"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GOAL_STATUSES.map((s) => <SelectItem key={s} value={s}>{GOAL_STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={form.priority ?? "medium"} onValueChange={(v) => setForm({ ...form, priority: v as GoalWrite["priority"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GOAL_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Due date (optional)</Label>
              <Input type="date" value={form.dueDate ?? ""} onChange={(e) => setForm({ ...form, dueDate: e.target.value || null })} />
            </div>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={create} disabled={saving || !form.employeeId || !form.title}>
              {saving ? "Saving…" : "Create goal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
