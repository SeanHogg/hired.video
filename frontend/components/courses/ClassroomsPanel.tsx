/**
 * Classrooms panel (#1887/#1888/#1890) — the educator/employer cohort hub,
 * rendered as the "Classrooms" tab on /tools (NOT a standalone route).
 *
 * i-Ready's core teacher value prop on hired.video: group learners into a
 * cohort, assign courses/paths with due dates, and watch a live progress
 * roll-up. Educator = Creator-program OR employer (#1886); the backend
 * gates creation, so a non-eligible user sees the prompt.
 *
 * Everything routes through /api/cohorts/* (CohortService → canActFor).
 */
import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import { TABLE_SURFACE, TABLE_HEAD } from "@/lib/ui/table-surface";
import { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import { useViewMode, type ViewMode } from "@/lib/hooks/useViewMode";
import { cn } from "@/lib/utils";
import { courseService } from "@/lib/services/course-service";
import {
  listManageableCohorts, getCohort, createCohort, updateCohort,
  addCohortMember, removeCohortMember,
  listCohortAssignments, createAssignment, removeAssignment,
  getCohortAnalytics, listMyPaths,
  type Cohort, type CohortMemberRow, type AssignmentRow, type CohortAnalytics,
} from "@/lib/courses/courses-api";
import {
  Users, Plus, Trash2, ClipboardCopy, AlertTriangle,
  CheckCircle2, CircleDashed, Clock,
} from "lucide-react";

type SubjectOption = { id: string; title: string; kind: "course" | "path" };

const STATUS_META: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  completed: { label: "Done", cls: "text-green-600", Icon: CheckCircle2 },
  in_progress: { label: "In progress", cls: "text-amber-600", Icon: Clock },
  not_started: { label: "Not started", cls: "text-muted-foreground", Icon: CircleDashed },
  not_linked: { label: "No account", cls: "text-muted-foreground/60", Icon: CircleDashed },
};

export default function ClassroomsPanel({
  view: viewProp,
}: {
  /** Cohort-browse layout (Scroll / Grid / Table). Controlled from the
   *  /tools PageHeader action panel; falls back to an internal persisted
   *  toggle when mounted standalone so the component stays self-contained. */
  view?: ViewMode;
} = {}) {
  const [internalView] = useViewMode(
    "tools.classrooms",
    "grid",
    BROWSE_VIEW_MODES,
  );
  const view = viewProp ?? internalView;
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCohorts = useCallback(async () => {
    setLoading(true);
    const rows = await listManageableCohorts().catch(() => [] as Cohort[]);
    setCohorts(rows);
    setLoading(false);
  }, []);

  useEffect(() => { void loadCohorts(); }, [loadCohorts]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreateErr(null);
    try {
      const c = await createCohort({ name: newName.trim() });
      setNewName("");
      await loadCohorts();
      setSelectedId(c.id);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Could not create classroom.");
    }
  };

  return (
    <div className="mt-2 space-y-6">
      {/* Inline "new classroom" create row — name + Create button. The
          cohort list below is the content surface and honours the
          Scroll / Grid / Table toggle in the page action panel, like every
          other content surface on /tools. */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
          placeholder="New classroom — e.g. Fall Cohort A"
          className="max-w-xs"
        />
        <Button onClick={handleCreate} disabled={!newName.trim()} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Create
        </Button>
        {createErr && <p className="text-xs text-destructive">{createErr}</p>}
      </div>

      {/* Cohort browse — Scroll / Grid / Table over the manageable cohorts. */}
      {loading ? (
        <p className="text-sm text-muted-foreground px-1">Loading…</p>
      ) : cohorts.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">
          No classrooms yet. Create one above to get started.
        </CardContent></Card>
      ) : (
        <CohortBrowse
          cohorts={cohorts}
          view={view}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}

      {/* Selected cohort detail */}
      {selectedId && (
        <CohortDetail key={selectedId} cohortId={selectedId} onChanged={loadCohorts} />
      )}
    </div>
  );
}

/** Cohort list rendered in the active browse layout (Scroll / Grid / Table).
 *  Picking a cohort opens its management detail below — the selected card /
 *  row stays highlighted so the user keeps their place. */
function CohortBrowse({
  cohorts,
  view,
  selectedId,
  onSelect,
}: {
  cohorts: Cohort[];
  view: ViewMode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (view === "table") {
    return (
      <div className={TABLE_SURFACE}>
        <table className="w-full text-left text-sm">
          <thead className={TABLE_HEAD}>
            <tr>
              <th className="px-3 py-2 font-medium">Classroom</th>
              <th className="px-3 py-2 font-medium">Members</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => (
              <tr
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={cn(
                  "cursor-pointer border-b border-border last:border-0 hover:bg-muted/30",
                  selectedId === c.id && "bg-primary/10",
                )}
              >
                <td className="px-3 py-2 font-medium">{c.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.memberCount ?? 0}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {c.status === "archived" ? "Archived" : "Active"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const renderCard = (c: Cohort) => (
    <CohortCard
      key={c.id}
      cohort={c}
      selected={selectedId === c.id}
      onSelect={() => onSelect(c.id)}
    />
  );
  if (view === "scroll") {
    return (
      <HorizontalScroller itemCount={cohorts.length}>
        {cohorts.map(renderCard)}
      </HorizontalScroller>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {cohorts.map(renderCard)}
    </div>
  );
}

/** Single cohort card for the Scroll / Grid browse layouts. */
function CohortCard({
  cohort,
  selected,
  onSelect,
}: {
  cohort: Cohort;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex h-full w-full flex-col items-start gap-1 rounded-lg border bg-card p-4 text-left transition hover:border-brand-primary hover:shadow-md",
        selected ? "border-brand-primary ring-1 ring-brand-primary" : "border-border",
      )}
    >
      <span className="flex items-center gap-2 font-medium">
        <Users className="h-4 w-4 text-brand-primary" />
        {cohort.name}
      </span>
      <span className="text-xs text-muted-foreground">
        {cohort.memberCount ?? 0} {(cohort.memberCount ?? 0) === 1 ? "member" : "members"}
        {cohort.status === "archived" ? " · archived" : ""}
      </span>
    </button>
  );
}

function CohortDetail({ cohortId, onChanged }: { cohortId: string; onChanged: () => void }) {
  const { t } = useTranslation();
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [members, setMembers] = useState<CohortMemberRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [analytics, setAnalytics] = useState<CohortAnalytics | null>(null);
  const [subjectOptions, setSubjectOptions] = useState<SubjectOption[]>([]);

  const [memberEmail, setMemberEmail] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [required, setRequired] = useState(true);

  const reload = useCallback(async () => {
    const [detail, asg, an] = await Promise.all([
      getCohort(cohortId).catch(() => null),
      listCohortAssignments(cohortId).catch(() => [] as AssignmentRow[]),
      getCohortAnalytics(cohortId).catch(() => null),
    ]);
    if (detail) { setCohort(detail.cohort); setMembers(detail.members); }
    setAssignments(asg);
    setAnalytics(an);
  }, [cohortId]);

  useEffect(() => {
    void reload();
    // Subject picker options: the educator's own courses + published library + own paths.
    void (async () => {
      const [mine, published, paths] = await Promise.all([
        courseService.listMine().catch(() => []),
        courseService.listPublished(50).catch(() => []),
        listMyPaths().catch(() => []),
      ]);
      const byId = new Map<string, SubjectOption>();
      for (const c of mine) byId.set(c.id, { id: c.id, title: c.title, kind: "course" });
      for (const c of published) if (!byId.has(c.id)) byId.set(c.id, { id: c.id, title: c.title, kind: "course" });
      for (const p of paths) byId.set(p.id, { id: p.id, title: `${p.title} (path)`, kind: "path" });
      setSubjectOptions([...byId.values()]);
    })();
  }, [reload]);

  const addMember = async () => {
    if (!memberEmail.trim()) return;
    await addCohortMember(cohortId, { invitedEmail: memberEmail.trim() }).catch(() => undefined);
    setMemberEmail("");
    await reload();
    onChanged();
  };

  const dropMember = async (memberId: string) => {
    await removeCohortMember(cohortId, memberId).catch(() => undefined);
    await reload();
    onChanged();
  };

  const assign = async () => {
    const opt = subjectOptions.find((o) => o.id === subjectId);
    if (!opt) return;
    await createAssignment(cohortId, {
      subjectType: opt.kind,
      subjectId: opt.id,
      required,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
    }).catch(() => undefined);
    setSubjectId(""); setDueAt("");
    await reload();
  };

  const dropAssignment = async (id: string) => {
    await removeAssignment(cohortId, id).catch(() => undefined);
    await reload();
  };

  const copyCode = () => { if (cohort?.joinCode) void navigator.clipboard?.writeText(cohort.joinCode); };

  if (!cohort) return <Card><CardContent className="p-10 text-center text-muted-foreground">Loading…</CardContent></Card>;

  return (
    <div className="space-y-6">
      {/* Header + join code + summary */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{cohort.name}</h2>
            {cohort.joinCode && (
              <button onClick={copyCode} className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
                Join code: <span className="font-mono tracking-wider">{cohort.joinCode}</span> <ClipboardCopy className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {analytics && (
            <div className="flex gap-4 text-sm">
              <Stat label="Members" value={analytics.memberCount} />
              <Stat label="Assignments" value={analytics.assignmentCount} />
              <Stat label="Completion" value={`${Math.round(analytics.summary.completionRate * 100)}%`} />
              <Stat label="Overdue" value={analytics.summary.overdue} danger={analytics.summary.overdue > 0} />
            </div>
          )}
          <Button
            variant="outline" size="sm"
            onClick={async () => { await updateCohort(cohortId, { status: cohort.status === "active" ? "archived" : "active" }); await reload(); onChanged(); }}
          >
            {cohort.status === "active" ? "Archive" : "Reactivate"}
          </Button>
        </CardContent>
      </Card>

      {/* Members + Assignments forms */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Members</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="student@email.com" type="email" />
              <Button size="sm" onClick={addMember} disabled={!memberEmail.trim()}><Plus className="h-4 w-4" /></Button>
            </div>
            <ul className="space-y-1 max-h-48 overflow-auto">
              {members.length === 0 && <li className="text-sm text-muted-foreground">No members yet. Add by email, or share the join code.</li>}
              {members.map((m) => (
                <li key={m.member.id} className="flex items-center justify-between text-sm py-1">
                  <span className="truncate">
                    {m.userName ?? m.member.displayName ?? m.userEmail ?? m.member.invitedEmail ?? "Member"}
                    {m.member.status === "invited" && <span className="text-xs text-muted-foreground"> · invited</span>}
                  </span>
                  <button onClick={() => dropMember(m.member.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Assign training</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Pick a course or path…</option>
              {subjectOptions.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="flex-1" />
              <label className="flex items-center gap-1 text-sm whitespace-nowrap">
                <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required
              </label>
            </div>
            <Button size="sm" className="w-full" onClick={assign} disabled={!subjectId}>Assign</Button>
            <ul className="space-y-1 max-h-32 overflow-auto">
              {assignments.map((a) => {
                const opt = subjectOptions.find((o) => o.id === a.subjectId);
                return (
                  <li key={a.id} className="flex items-center justify-between text-sm py-1">
                    <span className="truncate">
                      {opt?.title ?? a.subjectType} {a.dueAt && <span className="text-xs text-muted-foreground">· due {new Date(a.dueAt).toLocaleDateString()}</span>}
                    </span>
                    <button onClick={() => dropAssignment(a.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Gradebook grid (#2068 GAP-6) — columns from the canonical assignment
          set so member-specific assignments + first-member subsets align. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("cohort.gradebook.title")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!analytics || analytics.members.length === 0 || analytics.assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("cohort.gradebook.empty")}</p>
          ) : (
            <>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-3 font-medium">{t("cohort.gradebook.member")}</th>
                    <th className="py-2 px-3 font-medium whitespace-nowrap">
                      {t("learn.dashboard.completed")}
                    </th>
                    {analytics.assignments.map((col) => (
                      <th
                        key={col.assignmentId}
                        className="py-2 px-3 font-medium max-w-[160px] truncate"
                        title={col.title}
                      >
                        {col.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analytics.members.map((m) => {
                    const cellByAssignment = new Map(m.items.map((it) => [it.assignmentId, it]));
                    return (
                      <tr key={m.memberId} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <div className="truncate max-w-[180px]">{m.name ?? m.email ?? t("cohort.gradebook.member")}</div>
                          {!m.linked && (
                            <span className="text-xs text-muted-foreground/70">
                              {t("cohort.gradebook.notLinked")}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {t("cohort.gradebook.completed", { done: m.completedCount, total: m.totalCount })}
                        </td>
                        {analytics.assignments.map((col) => {
                          const it = cellByAssignment.get(col.assignmentId);
                          if (!it) {
                            return (
                              <td key={col.assignmentId} className="py-2 px-3 text-muted-foreground/40">
                                —
                              </td>
                            );
                          }
                          const meta = STATUS_META[it.status] ?? STATUS_META.not_started;
                          const Icon = it.overdue && it.status !== "completed" ? AlertTriangle : meta.Icon;
                          const cls = it.overdue && it.status !== "completed" ? "text-destructive" : meta.cls;
                          return (
                            <td key={col.assignmentId} className="py-2 px-3">
                              <span className={`inline-flex items-center gap-1 ${cls}`} title={meta.label}>
                                <Icon className="h-4 w-4" />
                                {it.status === "in_progress" && <span className="text-xs">{Math.round(it.fraction * 100)}%</span>}
                                {it.status === "completed" && it.scorePct != null && <span className="text-xs">{it.scorePct}%</span>}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-3">{t("cohort.gradebook.legend")}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div className="text-center">
      <div className={`font-semibold ${danger ? "text-destructive" : ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
