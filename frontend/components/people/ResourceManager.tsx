import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { peopleResource, peopleApi, employeeName, type Employee, type PeopleRecord } from "@/lib/people-ops/api";
import type { SurfaceDef, ColumnDef } from "@/lib/people-ops/surfaces";

/**
 * Generic segment-scoped CRUD UI for a People-Ops surface. Driven by a
 * SurfaceDef descriptor (no bespoke page per surface). Self-contained: fetches
 * its own data, decides its own visibility (upgrade-required state), and
 * resolves employee-reference columns to names.
 */
export default function ResourceManager({ def }: { def: SurfaceDef }) {
  const api = useMemo(() => peopleResource(def.path), [def.path]);
  const [rows, setRows] = useState<PeopleRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const needsEmployees = def.fields.some((f) => f.type === "employee") || def.columns.some((col) => col.key.endsWith("Id") && col.kind === "text");

  const load = useCallback(async () => {
    setLoading(true); setError(null); setUpgrade(false);
    try {
      const [data, emps] = await Promise.all([api.list(), needsEmployees ? peopleApi.listEmployees() : Promise.resolve([])]);
      setRows(data);
      setEmployees(emps);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load";
      if (/paid|upgrade/i.test(msg)) setUpgrade(true);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, [api, needsEmployees]);

  useEffect(() => { void load(); }, [load]);

  const empName = useMemo(() => {
    const m = new Map(employees.map((e) => [e.id, employeeName(e)]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [employees]);

  const create = async () => {
    setSaving(true); setFormErr(null);
    try {
      const body: PeopleRecord = {};
      for (const f of def.fields) {
        const v = form[f.name];
        if (v === undefined || v === "") continue;
        body[f.name] = f.type === "number" ? Number(v) : v;
      }
      await api.create(body);
      setOpen(false); setForm({});
      await load();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this item?")) return;
    try { await api.remove(id); await load(); } catch (e) { window.alert(e instanceof Error ? e.message : "Delete failed"); }
  };

  const renderCell = (col: ColumnDef, row: PeopleRecord) => {
    const v = row[col.key];
    if (col.kind === "date") return v ? new Date(v).toLocaleDateString() : "—";
    if (col.kind === "badge") return v ? <Badge variant="secondary">{String(v).replace(/_/g, " ")}</Badge> : "—";
    if (col.kind === "progress") return <span className="tabular-nums">{Number(v ?? 0)}%</span>;
    if (col.key.endsWith("Id") && col.kind === "text") return empName(v);
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return v == null || v === "" ? "—" : String(v);
  };

  if (upgrade) {
    return (
      <main className="px-6 py-16 max-w-2xl mx-auto text-center space-y-6">
        <h1 className="text-3xl font-bold">People Operations is a paid employer feature</h1>
        <p className="text-muted-foreground">Upgrade your company plan to unlock {def.title}.</p>
        <Button asChild><Link to="/people-operations">See plans &amp; features</Link></Button>
      </main>
    );
  }

  return (
    <main className="px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to="/people-ops" className="text-sm text-muted-foreground hover:underline">← People Operations</Link>
          <h1 className="text-3xl font-bold tracking-tight">{def.title}</h1>
          <p className="text-muted-foreground">{def.subtitle}</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" /> New</Button>
      </div>

      {loading ? <p className="text-muted-foreground">Loading…</p>
        : error ? <p className="text-red-600">{error}</p>
        : rows.length === 0 ? <p className="text-muted-foreground">Nothing here yet.</p>
        : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  {def.columns.map((col) => <TableHead key={col.key}>{col.label}</TableHead>)}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    {def.columns.map((col) => <TableCell key={col.key}>{renderCell(col, row)}</TableCell>)}
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => remove(row.id)}><Trash2 className="h-3 w-3" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New {def.title.replace(/s$/, "")}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {def.fields.map((f) => (
              <div key={f.name}>
                <Label>{f.label}{f.required ? " *" : ""}</Label>
                {f.type === "textarea" ? (
                  <Textarea value={form[f.name] ?? ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
                ) : f.type === "select" ? (
                  <Select value={form[f.name] ?? ""} onValueChange={(v) => setForm({ ...form, [f.name]: v })}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {(f.options ?? []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : f.type === "employee" ? (
                  <Select value={form[f.name] ?? ""} onValueChange={(v) => setForm({ ...form, [f.name]: v })}>
                    <SelectTrigger><SelectValue placeholder="Select employee…" /></SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => <SelectItem key={e.id} value={e.id}>{employeeName(e)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={f.type === "number" ? "number" : f.type === "date" ? "datetime-local" : "text"}
                    value={form[f.name] ?? ""}
                    onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
          {formErr && <p className="text-sm text-red-600">{formErr}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={create} disabled={saving || def.fields.some((f) => f.required && !form[f.name])}>
              {saving ? "Saving…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
