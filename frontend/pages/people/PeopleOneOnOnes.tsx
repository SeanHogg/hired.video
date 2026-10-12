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
import {
  peopleApi,
  employeeName,
  type Employee,
  type OneOnOne,
  type OneOnOneTemplate,
} from "@/lib/people-ops/api";
import { CalendarClock, Plus, Users } from "lucide-react";

export default function PeopleOneOnOnes() {
  useSEO("/people/one-on-ones");
  useBreadcrumbs([
    { name: "People Operations", url: "/people-operations" },
    { name: "1:1s", url: "/people/one-on-ones" },
  ]);

  const [sessions, setSessions] = useState<OneOnOne[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<OneOnOneTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [supervisorId, setSupervisorId] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [templateKey, setTemplateKey] = useState<string>("none");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUpgradeRequired(false);
    try {
      const [s, emps, tpls] = await Promise.all([
        peopleApi.listOneOnOnes(),
        peopleApi.listEmployees(),
        peopleApi.oneOnOneTemplates(),
      ]);
      setSessions(s);
      setEmployees(emps);
      setTemplates(tpls);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load 1:1s";
      if (/paid|upgrade/i.test(msg)) setUpgradeRequired(true);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const empName = useMemo(() => {
    const map = new Map(employees.map((e) => [e.id, employeeName(e)]));
    return (id: string) => map.get(id) ?? "Unknown";
  }, [employees]);

  const create = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const session = await peopleApi.createOneOnOne({
        supervisorId,
        participantId,
        scheduledDate: new Date(scheduledDate).toISOString(),
      });
      const tpl = templates.find((t) => t.key === templateKey);
      if (tpl) {
        for (const item of tpl.agenda) {
          await peopleApi.addAgendaItem(session.id, { title: item.title, status: "pending" });
        }
      }
      setOpen(false);
      setSupervisorId("");
      setParticipantId("");
      setScheduledDate("");
      setTemplateKey("none");
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not schedule the 1:1");
    } finally {
      setSaving(false);
    }
  };

  if (upgradeRequired) {
    return (
      <AppShell bgClassName="bg-background">
        <main className="px-6 py-16 max-w-2xl mx-auto text-center space-y-6">
          <Users className="h-12 w-12 mx-auto text-primary" />
          <h1 className="text-3xl font-bold">People Operations is a paid employer feature</h1>
          <p className="text-muted-foreground">
            Run a never-miss 1:1 cadence with shared agendas and action items on a paid company plan.
          </p>
          <Button asChild>
            <Link to="/people-operations">See plans & features</Link>
          </Button>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-background">
      <main className="px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">1-on-1s</h1>
            <p className="text-muted-foreground">A recurring cadence so a manager never drops a 1:1.</p>
          </div>
          <Button onClick={() => setOpen(true)} disabled={employees.length < 2}>
            <Plus className="h-4 w-4 mr-2" /> Schedule 1:1
          </Button>
        </div>

        {employees.length < 2 && (
          <p className="text-sm text-muted-foreground">
            Add at least two people to the <Link to="/people/roster" className="underline">roster</Link> to schedule a 1:1.
          </p>
        )}

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : sessions.length === 0 ? (
          <p className="text-muted-foreground">No 1:1s scheduled yet.</p>
        ) : (
          <div className="grid gap-3">
            {sessions.map((s) => (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarClock className="h-4 w-4" />
                    {empName(s.supervisorId)} ↔ {empName(s.participantId)}
                    <Badge variant={s.status === "completed" ? "secondary" : "default"} className="ml-auto">
                      {s.status}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>
                    {new Date(s.scheduledDate).toLocaleString()} · {s.duration} min · {s.meetingType}
                  </p>
                  {s.agenda.length > 0 && (
                    <ul className="list-disc ml-5">
                      {s.agenda.map((a, i) => (
                        <li key={i}>{a.title}</li>
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
          <DialogHeader>
            <DialogTitle>Schedule a 1:1</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Manager (supervisor)</Label>
              <Select value={supervisorId} onValueChange={setSupervisorId}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{employeeName(e)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Report (participant)</Label>
              <Select value={participantId} onValueChange={setParticipantId}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {employees
                    .filter((e) => e.id !== supervisorId)
                    .map((e) => (
                      <SelectItem key={e.id} value={e.id}>{employeeName(e)}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date & time</Label>
              <Input type="datetime-local" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </div>
            <div>
              <Label>Starter agenda (optional)</Label>
              <Select value={templateKey} onValueChange={setTemplateKey}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Blank</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={create} disabled={saving || !supervisorId || !participantId || !scheduledDate}>
              {saving ? "Scheduling…" : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
