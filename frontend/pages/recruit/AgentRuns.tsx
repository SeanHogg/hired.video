/**
 * AI Recruiter Agent v2 hub (#1207) at /recruit/agent.
 *
 *   Intake panel: free-text brief → structured criteria (or pick an
 *   existing job and pre-fill from it).
 *   Source button: criteria → ranked candidates + outreach drafts,
 *   persisted as a `recruiter_agent_runs` row.
 *   Run list: every prior run with scored result counts and click-into
 *   detail.
 *   Follow-ups panel: pending / sent / cancelled, with cancel actions
 *   on still-pending entries.
 *
 * All wiring matches the LinkedIn Hiring Assistant parity surface:
 * intake → source → schedule follow-ups is the entire loop. Auto-send
 * is still recruiter-in-the-loop (gap #1206) — the panel shows the
 * draft + lets the recruiter schedule the cadence, but dispatch
 * happens through the recruiter's channel of choice.
 */

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { useAuth } from "@/lib/auth";
import { USER_ROLES } from "@shared/user-roles";
import { toast } from "sonner";

import {
  recruiterAgentService,
  type AgentCriteria,
  type AgentFollowup,
  type AgentRun,
} from "@/lib/services/recruiter-agent-service";

const FOLLOWUP_OFFSETS = [3, 7, 14] as const;

export default function AgentRuns() {
  const location = useLocation();
  const { user } = useAuth();
  const role = (user as any)?.role ?? "";
  const isRecruiterOrEmployer = role === USER_ROLES.RECRUITER || role === USER_ROLES.EMPLOYER || (user as any)?.isSuperAdmin;

  useSEO(location.pathname, {
    title: "AI Recruiter Agent — hired.video",
    description: "Intake → source → score → schedule follow-ups. The LinkedIn Hiring Assistant workflow at $9.95/mo.",
    canonical: "https://hired.video/recruit/agent",
  });
  useBreadcrumbs([
    { name: "Recruit", url: "/dashboard" },
    { name: "AI Recruiter Agent", url: location.pathname },
  ]);

  const [tab, setTab] = useState<"intake" | "runs" | "followups">("intake");
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [followups, setFollowups] = useState<AgentFollowup[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  async function refreshRuns() {
    setLoadingRuns(true);
    try {
      setRuns(await recruiterAgentService.listRuns());
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't load runs");
    } finally {
      setLoadingRuns(false);
    }
  }

  async function refreshFollowups() {
    try {
      setFollowups(await recruiterAgentService.listFollowups());
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't load follow-ups");
    }
  }

  useEffect(() => {
    if (!isRecruiterOrEmployer) return;
    refreshRuns();
    refreshFollowups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecruiterOrEmployer]);

  if (!isRecruiterOrEmployer) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle>Recruiter-only</CardTitle>
              <CardDescription>
                The AI Recruiter Agent is available to Recruiter and Employer accounts.
                Switch persona from your dashboard if you have multiple roles.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-background">
      <div className="p-6 space-y-6">
        <header className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">AI Recruiter Agent</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              Plain-English brief → ranked candidates + personalised outreach drafts +
              scheduled follow-ups. The LinkedIn Hiring Assistant loop at $9.95/seat/mo.
            </p>
          </div>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="intake">Intake</TabsTrigger>
            <TabsTrigger value="runs">Runs ({runs.length})</TabsTrigger>
            <TabsTrigger value="followups">
              Follow-ups ({followups.filter((f) => f.status === "pending").length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="intake" className="mt-4">
            <IntakePanel
              onCompleted={async () => {
                await refreshRuns();
                setTab("runs");
              }}
            />
          </TabsContent>

          <TabsContent value="runs" className="mt-4">
            <RunsPanel
              runs={runs}
              loading={loadingRuns}
              onScheduleFollowup={async (input) => {
                try {
                  await recruiterAgentService.scheduleFollowup(input);
                  toast.success("Follow-up scheduled");
                  refreshFollowups();
                } catch (e: any) {
                  toast.error(e?.message ?? "Couldn't schedule");
                }
              }}
            />
          </TabsContent>

          <TabsContent value="followups" className="mt-4">
            <FollowupsPanel
              followups={followups}
              onCancel={async (id) => {
                try {
                  await recruiterAgentService.cancelFollowup(id);
                  toast.success("Cancelled");
                  refreshFollowups();
                } catch (e: any) {
                  toast.error(e?.message ?? "Couldn't cancel");
                }
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Intake — free-text brief → criteria → source
// ───────────────────────────────────────────────────────────────────────

function IntakePanel({ onCompleted }: { onCompleted: () => void | Promise<void> }) {
  const [brief, setBrief] = useState("");
  const [criteria, setCriteria] = useState<AgentCriteria | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleDerive() {
    if (!brief.trim()) return;
    setBusy(true);
    try {
      const c = await recruiterAgentService.intake({ briefText: brief.trim() });
      setCriteria(c);
    } catch (e: any) {
      toast.error(e?.message ?? "Intake failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSource() {
    if (!criteria) return;
    setBusy(true);
    try {
      const result = await recruiterAgentService.source({
        jobTitle: criteria.jobTitle,
        skills: criteria.skills,
        location: criteria.location,
        experienceYears: criteria.experienceYears,
        maxCandidates: criteria.maxCandidates,
      });
      toast.success(`Sourced ${result.candidatesFound} candidate${result.candidatesFound === 1 ? "" : "s"}`);
      setBrief("");
      setCriteria(null);
      await onCompleted();
    } catch (e: any) {
      toast.error(e?.message ?? "Source failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Describe the role in plain English</CardTitle>
        <CardDescription>
          Example: "Hiring a senior staff infrastructure engineer with deep Go and
          Kubernetes experience for a Series C fintech in NYC, 7+ years."
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          rows={5}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Hiring a..."
          disabled={busy}
        />
        <div className="flex gap-2">
          <Button onClick={handleDerive} disabled={busy || !brief.trim()} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Derive criteria
          </Button>
        </div>

        {criteria && (
          <div className="rounded border p-3 space-y-3 bg-muted/30">
            <div className="text-sm font-medium">Parsed criteria</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Field label="Job title" value={criteria.jobTitle} onChange={(v) => setCriteria({ ...criteria, jobTitle: v })} />
              <Field
                label="Location"
                value={criteria.location}
                onChange={(v) => setCriteria({ ...criteria, location: v })}
              />
              <Field
                label="Experience (yrs)"
                value={criteria.experienceYears != null ? String(criteria.experienceYears) : ""}
                onChange={(v) => setCriteria({ ...criteria, experienceYears: v ? Number(v) : null })}
              />
              <Field
                label="Max candidates"
                value={String(criteria.maxCandidates)}
                onChange={(v) => setCriteria({ ...criteria, maxCandidates: Number(v) || 20 })}
              />
            </div>
            <div className="text-sm">
              <Label className="text-xs">Skills</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {criteria.skills.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No skills detected.</span>
                ) : (
                  criteria.skills.map((s) => (
                    <Badge key={s} variant="secondary" className="text-[10px]">
                      {s}
                    </Badge>
                  ))
                )}
              </div>
            </div>
            <Button onClick={handleSource} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Source candidates
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm" />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Runs panel
// ───────────────────────────────────────────────────────────────────────

function RunsPanel({
  runs,
  loading,
  onScheduleFollowup,
}: {
  runs: AgentRun[];
  loading: boolean;
  onScheduleFollowup: (input: {
    runId: string;
    candidateId: string;
    body: string;
    dayOffset?: number;
    sequenceIndex?: number;
  }) => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading runs…
      </div>
    );
  }
  if (runs.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          No runs yet. Start one in the Intake tab.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {runs.map((run) => {
        const isOpen = expanded === run.id;
        return (
          <Card key={run.id}>
            <CardHeader>
              <button
                className="w-full text-left flex items-start justify-between gap-3"
                onClick={() => setExpanded(isOpen ? null : run.id)}
              >
                <div>
                  <CardTitle className="text-base">{run.jobTitle}</CardTitle>
                  <CardDescription className="text-xs">
                    {run.candidatesScored} scored · {run.status}
                    {run.completedAt && ` · ${new Date(run.completedAt).toLocaleDateString()}`}
                  </CardDescription>
                </div>
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CardHeader>
            {isOpen && (
              <CardContent className="space-y-2">
                {run.results.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No results.</p>
                ) : (
                  run.results.map((r) => (
                    <div key={r.candidateId} className="rounded border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{r.name}</p>
                          <p className="text-xs text-muted-foreground">{r.email ?? "—"} · score {r.score}</p>
                        </div>
                        <div className="flex gap-1">
                          {FOLLOWUP_OFFSETS.map((days, idx) => (
                            <Button
                              key={days}
                              size="sm"
                              variant="outline"
                              className="text-[10px] h-7"
                              onClick={() =>
                                onScheduleFollowup({
                                  runId: run.id,
                                  candidateId: r.candidateId,
                                  body: r.outreachDraft,
                                  dayOffset: days,
                                  sequenceIndex: idx + 1,
                                })
                              }
                            >
                              <Clock className="h-3 w-3 mr-1" /> +{days}d
                            </Button>
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{r.outreachDraft}</p>
                      <p className="text-[10px] text-muted-foreground italic">{r.scoreReason}</p>
                    </div>
                  ))
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Follow-ups panel
// ───────────────────────────────────────────────────────────────────────

function FollowupsPanel({
  followups,
  onCancel,
}: {
  followups: AgentFollowup[];
  onCancel: (id: string) => void | Promise<void>;
}) {
  if (followups.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          No follow-ups scheduled. Schedule them from a run's candidate row.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {followups.map((f) => (
        <Card key={f.id}>
          <CardContent className="pt-4 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge variant={f.status === "pending" ? "secondary" : "outline"} className="text-[10px]">
                  {f.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {f.followupKind} #{f.sequenceIndex} · {new Date(f.scheduledFor).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2 line-clamp-3 whitespace-pre-wrap">{f.body}</p>
            </div>
            {f.status === "pending" && (
              <Button size="sm" variant="ghost" onClick={() => onCancel(f.id)} className="gap-1">
                <XCircle className="h-4 w-4" /> Cancel
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
