// Career 360 — target-driven gap-and-plan view for job seekers.
//
// Two phases:
//   1. No target → ask "what do you want to become?", AI proposes 3
//      candidates from the seeker's profile, they pick one (or enter a
//      custom one).
//   2. Target chosen → render the wheel (current state at a glance),
//      the gap analysis, the roadmap, and the score-history sparklines
//      below the wheel ("stamps of improvement"). Clicking a wheel
//      segment or a gap row opens AI Coach with the right context.
//
// Data flows through `career360Service`:
//   - GET  /api/career360            → cached doc + score history
//   - POST /api/career360/suggest    → 3 fresh target candidates
//   - POST /api/career360/select     → run gap + roadmap, persist
//   - DELETE /api/career360/target   → clear (keeps suggestions)

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Compass, Loader2 } from "lucide-react";
import { ToolShell } from "@/components/tools/ToolShell";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CareerHealthWheel,
  HEALTH_FILL_COLORS,
  useHealthLabels,
  type SegmentHealth,
  type WheelSegment,
} from "@/components/career360/CareerHealthWheel";
import { TargetPicker } from "@/components/career360/TargetPicker";
import { TargetRoadmap } from "@/components/career360/TargetRoadmap";
import { ScoreHistorySparkline } from "@/components/career360/ScoreHistorySparkline";
import { useAuth } from "@/lib/auth";
import { useAI } from "@/lib/ai-context";
import {
  createGeneralContext,
  createResumeContext,
} from "@/lib/utils/ai-context-helpers";
import { career360Service, type Career360State } from "@/lib/services/career360-service";
import { useToolRunRecorder } from "@/lib/tools/use-tool-run-recorder";
import { buildCareer360RunRecord } from "@/lib/tools/career360-run-result";
import { resumeService } from "@/lib/services/resume-service";
import { toast } from "sonner";
import { appendDiagnosticReference } from "@/lib/llm-diagnostic";
import type { AIContext } from "@/lib/types/ai-context";
import type {
  Gap,
  ScoreHistorySeries,
  SelectedTarget,
  TargetSuggestion,
} from "@shared/career360-types";

type WheelSignal = WheelSegment & {
  ring: "outer" | "inner";
  coachPrompt: string;
};

const OUTER_BLUEPRINT: Array<Pick<WheelSignal, "id" | "label" | "ring" | "coachPrompt">> = [
  {
    id: "resume",
    label: "Resume",
    ring: "outer",
    coachPrompt: "Coach me on improving my resume quality.",
  },
  {
    id: "profile",
    label: "Profile",
    ring: "outer",
    coachPrompt: "Audit my candidate profile (headline + summary).",
  },
  {
    id: "skills",
    label: "Skills",
    ring: "outer",
    coachPrompt: "Review my skill coverage relative to my target role.",
  },
  {
    id: "experience",
    label: "Experience",
    ring: "outer",
    coachPrompt: "Coach me on bridging my experience gaps for my target role.",
  },
  {
    id: "certifications",
    label: "Certs",
    ring: "outer",
    coachPrompt: "What certifications would help me land my target role?",
  },
  {
    id: "narrative",
    label: "Narrative",
    ring: "outer",
    coachPrompt: "Help me sharpen my career narrative for my target role.",
  },
  {
    id: "outreach",
    label: "Outreach",
    ring: "outer",
    coachPrompt: "Build me a weekly outreach cadence to land my target role.",
  },
  {
    id: "salary",
    label: "Salary",
    ring: "outer",
    coachPrompt: "Help me benchmark and negotiate salary for my target role.",
  },
];

const INNER_BLUEPRINT: Array<Pick<WheelSignal, "id" | "label" | "ring" | "coachPrompt">> = [
  {
    id: "callback-rate",
    label: "Callbacks",
    ring: "inner",
    coachPrompt: "My callback rate from applications is low — what should I change?",
  },
  {
    id: "interview-conversion",
    label: "Interviews",
    ring: "inner",
    coachPrompt: "Coach me on converting more first-round interviews.",
  },
  {
    id: "offer-rate",
    label: "Offers",
    ring: "inner",
    coachPrompt: "Walk me through the offer-conversion playbook.",
  },
  {
    id: "goal-fit",
    label: "Goal Fit",
    ring: "inner",
    coachPrompt: "Stress-test my career goals against my current skills and timeline.",
  },
];

/** Map a Gap's category onto a wheel segment id so an active target's
 *  gaps can color the ring. The wheel is the at-a-glance summary; the
 *  gap list is the detail. Categories are 1:1 with the outer ring. */
const CATEGORY_TO_SEGMENT: Record<Gap["category"], string> = {
  resume: "resume",
  profile: "profile",
  skills: "skills",
  experience: "experience",
  certifications: "certifications",
  narrative: "narrative",
  outreach: "outreach",
  salary: "salary",
};

function severityToHealth(severity: Gap["severity"]): SegmentHealth {
  if (severity === "high") return "poor";
  if (severity === "medium") return "moderate";
  return "good";
}

/** Build the AI-Coach page context for a Career 360 chat session. When
 *  the seeker has a master resume on file we hand it to the panel so
 *  resume-bound tools (scorer / summarize / sentiment / extractor)
 *  receive a real resumeId via `resolveActiveResumeId` in
 *  AIChatPanel; otherwise we fall back to a general context so the
 *  chat still opens with sensible suggested actions. */
function buildChatContext(
  masterResume: MasterResumeRef | null,
  role: string | undefined,
): AIContext {
  if (masterResume) {
    return createResumeContext(
      "resume-view",
      {
        id: masterResume.id,
        title: masterResume.title,
        summary: masterResume.summary,
      },
      role,
    );
  }
  return createGeneralContext(role);
}

/** Append the chosen target so the LLM knows what role the seeker is
 *  optimising toward when they didn't include it in the prompt. */
function buildTargetPrimer(target: SelectedTarget): string {
  const seniority = target.seniority ? ` (${target.seniority})` : "";
  return `My active Career 360 target is ${target.title}${seniority}, on a ${target.timelineMonths}-month horizon.`;
}

/** When the seeker hasn't picked a target yet but Career 360 has already
 *  surfaced AI suggestions, pass those to the coach so it can answer
 *  against the most likely targets instead of asking the user to clarify
 *  what role they're aiming for. */
function buildSuggestionsPrimer(suggestions: TargetSuggestion[]): string {
  if (!suggestions.length) return "";
  const lines = suggestions.map((s, i) => {
    const seniority = s.seniority ? ` (${s.seniority})` : "";
    return `${i + 1}. ${s.title}${seniority} — ${s.timelineMonths}-month horizon. ${s.description}`;
  });
  return [
    "I haven't locked in a target yet, but Career 360 has surfaced these AI-suggested next roles from my profile — answer against all three (call out which apply where they differ):",
    ...lines,
  ].join("\n");
}

/** #422 — Map a 0-100 measured score into the same `SegmentHealth`
 *  enum the gap-severity branch already uses. Bands are intentionally
 *  conservative — a "moderate" 60 is the seeker's signal to act, not
 *  to celebrate. Returns "unknown" when no score has been measured yet
 *  so the wheel honestly distinguishes "no data" from "low score". */
function scoreToHealth(score: number | null | undefined): SegmentHealth {
  if (typeof score !== "number" || !Number.isFinite(score)) return "unknown";
  if (score >= 80) return "good";
  if (score >= 50) return "moderate";
  return "poor";
}

/** #422 — Tool IDs that contribute the latest measured score for each
 *  segment. Multiple tools may write into the same segment; the
 *  worst latest score wins so the wheel always reflects the floor
 *  (consistent with the "highest severity" rule the gap branch uses).
 *  Add a new tool ↔ segment mapping here, not inside the rollup. */
const SEGMENT_SCORE_SOURCES: Record<string, string[]> = {
  resume: ["ai-resume-scorer", "resume-optimizer"],
  profile: ["profile-audit"],
  salary: ["salary-calculator"],
};

interface ScoreHistorySeriesLike {
  toolId?: string;
  points?: Array<{ score?: number | null } | undefined>;
}

function latestScoreFor(history: ScoreHistorySeriesLike[], toolId: string): number | null {
  const series = history.find((s) => s?.toolId === toolId);
  const points = series?.points ?? [];
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const score = points[i]?.score;
    if (typeof score === "number" && Number.isFinite(score)) return score;
  }
  return null;
}

/** #422 — Roll up per-segment health by BLENDING gap severity and the
 *  latest measured score. Worse-of-the-two wins so the wheel never
 *  paints "good" while the user's measured score sits in the floor
 *  band. Unknown × measured = measured; measured × gap = worst. */
function computeWheelHealth(
  gaps: Gap[],
  history: ScoreHistorySeriesLike[] = [],
): Record<string, SegmentHealth> {
  const health: Record<string, SegmentHealth> = {};

  // First pass: gap severity (existing behaviour).
  for (const gap of gaps) {
    const segment = CATEGORY_TO_SEGMENT[gap.category];
    if (!segment) continue;
    const next = severityToHealth(gap.severity);
    const cur = health[segment];
    if (!cur || rank(next) < rank(cur)) {
      health[segment] = next;
    }
  }

  // Second pass: measured scores. Take the worst latest score across
  // every tool wired to this segment, then merge against the gap-side
  // value via the same `rank()` ordering.
  for (const [segment, toolIds] of Object.entries(SEGMENT_SCORE_SOURCES)) {
    let segmentScoreHealth: SegmentHealth = "unknown";
    for (const toolId of toolIds) {
      const latest = latestScoreFor(history, toolId);
      const candidate = scoreToHealth(latest);
      if (rank(candidate) < rank(segmentScoreHealth)) segmentScoreHealth = candidate;
    }
    if (segmentScoreHealth === "unknown") continue;
    const cur = health[segment];
    if (!cur || rank(segmentScoreHealth) < rank(cur)) {
      health[segment] = segmentScoreHealth;
    }
  }
  return health;
}

function rank(h: SegmentHealth): number {
  return h === "poor" ? 0 : h === "moderate" ? 1 : h === "unknown" ? 2 : 3;
}

interface MasterResumeRef {
  id: string;
  title?: string;
  summary?: string;
}

export default function Career360() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const healthLabels = useHealthLabels();
  const { isAuthenticated, user } = useAuth();
  const { openAIWithPageContextAndMessage } = useAI();
  const { recordRun } = useToolRunRecorder("career-360");
  const [state, setState] = useState<Career360State | null>(null);
  const [masterResume, setMasterResume] = useState<MasterResumeRef | null>(null);
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [next, groups] = await Promise.all([
          career360Service.getState(),
          resumeService.getMasterResumeGroups().catch(() => []),
        ]);
        if (cancelled) return;
        setState(next);
        // Pick the first master resume — Career 360 is a single-target,
        // single-resume surface in v1; downstream tools (resume-scorer,
        // sentiment, summarize) need a real resumeId or they 400 with
        // "Resume content is too short or empty".
        const first = groups[0]?.masterResume;
        if (first?.id) {
          setMasterResume({
            id: first.id,
            title: first.title ?? undefined,
            summary: first.summary ?? undefined,
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[career360] load failed", err);
          toast.error(t("tools.career360.toastLoadFailed"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const selected = state?.doc?.selected ?? null;
  const suggestions = state?.doc?.suggested ?? [];
  const history = state?.history ?? [];

  const wheelHealth = useMemo(
    () => (selected ? computeWheelHealth(selected.gaps, history) : {}),
    [selected],
  );

  const outer: WheelSignal[] = useMemo(
    () =>
      OUTER_BLUEPRINT.map((b) => ({
        ...b,
        // Resolve the wheel label in the active locale; the blueprint's
        // English label is the i18next default so a missing key never
        // renders a raw key.
        label: t(`tools.career360.segment.${b.id}`, b.label),
        health: wheelHealth[b.id] ?? "unknown",
      })),
    [wheelHealth, t],
  );

  // Inner ring = funnel outcomes (#421), derived server-side from the
  // seeker's saved-jobs pipeline + active-target gap severities. Stays
  // "unknown" (grey) until there's enough signal — better grey than a
  // misleading green/red off one or two applications.
  const outcomes = state?.outcomes;
  const inner: WheelSignal[] = useMemo(
    () =>
      INNER_BLUEPRINT.map((b) => ({
        ...b,
        label: t(`tools.career360.segment.${b.id}`, b.label),
        health: ((outcomes ?? []).find((o) => o.id === b.id)?.health ??
          "unknown") as SegmentHealth,
      })),
    [outcomes, t],
  );

  const counts = useMemo(() => {
    const out: Record<SegmentHealth, number> = { good: 0, moderate: 0, poor: 0, unknown: 0 };
    for (const s of [...outer, ...inner]) out[s.health] += 1;
    return out;
  }, [outer, inner]);

  const refreshState = async () => {
    try {
      const next = await career360Service.getState();
      setState(next);
    } catch (err) {
      console.error("[career360] refresh failed", err);
    }
  };

  /** Commit a freshly built plan to local state AND record it as a
   *  "career-360" tool run. Career 360's "run" is the gap-and-roadmap
   *  computation, so every select / custom-target / refresh persists a
   *  run — that's what the header's "View History" sheet reads. Shared
   *  across all three entry points so the record-on-build behaviour can't
   *  drift between them. Recording is fire-and-forget: it never blocks the
   *  plan from rendering (the recorder hook swallows persistence errors). */
  const persistSelected = (next: SelectedTarget) => {
    setState((prev) => ({
      doc: { ...(prev?.doc ?? {}), selected: next },
      history: prev?.history ?? [],
      outcomes: prev?.outcomes ?? [],
    }));
    void recordRun(buildCareer360RunRecord(next));
  };

  const handleSuggest = async () => {
    setSuggesting(true);
    try {
      const next = await career360Service.suggest();
      setState((prev) => ({
        doc: {
          ...(prev?.doc ?? {}),
          suggested: next,
          suggestedAt: new Date().toISOString(),
        },
        history: prev?.history ?? [],
        outcomes: prev?.outcomes ?? [],
      }));
    } catch (err) {
      console.error("[career360] suggest failed", err);
      toast.error(
        appendDiagnosticReference(
          t("tools.career360.toastSuggestFailed"),
          err,
        ),
      );
    } finally {
      setSuggesting(false);
    }
  };

  const handleSelect = async (suggestionId: string) => {
    setSelecting(true);
    try {
      const next = await career360Service.select({ fromSuggestionId: suggestionId });
      persistSelected(next);
    } catch (err) {
      console.error("[career360] select failed", err);
      toast.error(
        appendDiagnosticReference(
          t("tools.career360.toastPlanFailed"),
          err,
        ),
      );
    } finally {
      setSelecting(false);
    }
  };

  const handleCustomTarget = async (params: {
    title: string;
    seniority?: string;
    timelineMonths?: number;
  }) => {
    setSelecting(true);
    try {
      const next = await career360Service.select({ custom: params });
      persistSelected(next);
    } catch (err) {
      console.error("[career360] custom select failed", err);
      toast.error(
        appendDiagnosticReference(t("tools.career360.toastPlanFailedTarget"), err),
      );
    } finally {
      setSelecting(false);
    }
  };

  const handleRefreshPlan = async () => {
    if (!selected) return;
    setSelecting(true);
    try {
      // Re-running select with the same id refreshes the rubric/gaps
      // against the seeker's current state.
      const next = await career360Service.select({
        custom: {
          title: selected.title,
          seniority: selected.seniority,
          timelineMonths: selected.timelineMonths,
        },
      });
      persistSelected(next);
      toast.success(t("tools.career360.toastPlanRefreshed"));
    } catch (err) {
      console.error("[career360] refresh plan failed", err);
      toast.error(t("tools.career360.toastPlanRefreshFailed"));
    } finally {
      setSelecting(false);
    }
  };

  const handleClearTarget = async () => {
    setClearing(true);
    try {
      await career360Service.clear();
      await refreshState();
    } catch (err) {
      console.error("[career360] clear failed", err);
      toast.error(t("tools.career360.toastClearFailed"));
    } finally {
      setClearing(false);
    }
  };

  /** Single entry point for "open AI Coach with the right context".
   *  All Career 360 surfaces (segment click, full-review button, future
   *  per-gap callbacks) route through this so the priming message,
   *  page context, and master-resume binding stay DRY. */
  const openCoach = (basePrompt: string) => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    const lines = [basePrompt.trim()];
    if (selected) {
      lines.push(buildTargetPrimer(selected));
    } else if (suggestions.length > 0) {
      // No locked target yet — pass the suggested ones so the coach can
      // answer specifically instead of asking the seeker to first
      // clarify which role they're chasing (issue: certs prompt sent
      // with no context made the coach demand a target).
      lines.push(buildSuggestionsPrimer(suggestions));
    }
    if (masterResume?.title || masterResume?.summary) {
      lines.push(
        `My resume on file is "${masterResume.title ?? "Untitled"}". ${masterResume.summary ?? ""}`.trim(),
      );
    }
    if (!masterResume) {
      lines.push(
        "I don't have a master resume on file yet — ask me for the relevant background instead of running scoring tools.",
      );
    }
    const message = lines.filter(Boolean).join("\n\n");
    openAIWithPageContextAndMessage(buildChatContext(masterResume, user?.role), message);
  };

  const openCoachForSegment = (signal: WheelSignal) => openCoach(signal.coachPrompt);

  const openCoachForGap = (gap: Gap) => {
    const targetTitle = selected?.title ?? "my target role";
    openCoach(
      `Coach me on closing this gap toward becoming ${targetTitle}: ${gap.label}. Today: ${gap.currentValue}. Target: ${gap.targetValue}. What should I do this week?`,
    );
  };

  return (
    <ToolShell
      toolId="career-360"
      header={{
        icon: <Compass className="h-6 w-6 text-brand-purple" />,
        iconBgClassName: "bg-brand-purple/10",
        title: t("tools.career360.title"),
        description: t("tools.career360.subtitle"),
        tier: "free",
      }}
    >
          {loading ? (
            <Card className="mt-4">
              <CardContent className="p-12 flex items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t("status.loading")}
              </CardContent>
            </Card>
          ) : !isAuthenticated ? (
            <Career360Marketing outer={outer} inner={inner} />
          ) : (
            <div className="space-y-6 mt-4">
              {/* #442 — Inline notice for zero-resume seekers. Self-gates
                  on `!masterResume && !loading`. The wheel + target
                  picker stay interactive (target gap analysis works
                  without a resume); the notice gives the seeker an
                  on-ramp to build one before clicking a segment, instead
                  of the segment-click hitting an LLM that says "paste
                  your resume". Per the DRY rule we don't drill a
                  `hasMasterResume` boolean — the page-level component
                  decides its own visibility from the same state. */}
              {!masterResume && (
                <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20">
                  <CardContent className="p-4 flex items-start gap-3 text-sm">
                    <div className="flex-1">
                      <div className="font-medium">{t("tools.career360.gateTitle")}</div>
                      <p className="text-muted-foreground mt-1">
                        {t("tools.career360.gateBody")}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="default" className="shrink-0">
                      <Link to="/resume-builder">{t("tools.career360.gateCta")}</Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
                <Card>
                  <CardContent className="p-6 space-y-6">
                    <div className="flex items-center justify-center">
                      <div className="w-full max-w-[560px] aspect-square">
                        <CareerHealthWheel
                          outer={outer}
                          inner={inner}
                          onSegmentClick={(seg) => {
                            const found = [...outer, ...inner].find((s) => s.id === seg.id);
                            if (found) openCoachForSegment(found);
                          }}
                        />
                      </div>
                    </div>
                    {!selected && (
                      <>
                        <Separator />
                        <TargetPicker
                          suggestions={suggestions}
                          isSuggesting={suggesting}
                          isSelecting={selecting}
                          onRefresh={handleSuggest}
                          onChoose={handleSelect}
                          onCustom={handleCustomTarget}
                        />
                      </>
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <h3 className="font-semibold text-sm">{t("tools.career360.legendHeading")}</h3>
                      <div className="space-y-1.5 text-sm">
                        {(["good", "moderate", "poor", "unknown"] as const).map((h) => (
                          <div key={h} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block h-3 w-3 rounded-sm"
                                style={{ backgroundColor: HEALTH_FILL_COLORS[h] }}
                              />
                              <span>{healthLabels[h]}</span>
                            </div>
                            <Badge variant="secondary" className="font-mono">
                              {counts[h]}
                            </Badge>
                          </div>
                        ))}
                      </div>
                      {!selected && (
                        <p className="text-xs text-muted-foreground">
                          {t("tools.career360.legendPickTargetHint")}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {history.length > 0 && (
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        <h3 className="font-semibold text-sm">{t("tools.career360.stampsHeading")}</h3>
                        <p className="text-xs text-muted-foreground">
                          {t("tools.career360.stampsCaption")}
                        </p>
                        <div className="space-y-3 pt-1">
                          {history.map((series: ScoreHistorySeries) => (
                            <div key={series.toolId}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="font-medium">{series.label}</span>
                                <span className="text-muted-foreground">
                                  {t("tools.career360.runCount", { count: series.points.length })}
                                </span>
                              </div>
                              <ScoreHistorySparkline series={series} />
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>

              {selected && (
                <TargetRoadmap
                  selected={selected}
                  isRefreshing={selecting}
                  isClearing={clearing}
                  onRefresh={handleRefreshPlan}
                  onClear={handleClearTarget}
                  onCoachGap={openCoachForGap}
                />
              )}
            </div>
          )}
    </ToolShell>
  );
}

/** Logged-out preview for /tools/career-360. ToolPageHeader already
 *  renders <ToolAnonValueCard> above this (title + features + signup
 *  CTA from the catalog), so this component only owns the unique
 *  Career 360 surface: an empty wheel as a visual preview plus the
 *  health legend. Keeping the same layout as the authenticated view
 *  means a visitor who signs in lands on the surface they were
 *  already previewing instead of a context-switch. */
function Career360Marketing({
  outer,
  inner,
}: {
  outer: WheelSignal[];
  inner: WheelSignal[];
}) {
  const { t } = useTranslation();
  const healthLabels = useHealthLabels();
  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <div className="w-full max-w-[560px] aspect-square">
                <CareerHealthWheel outer={outer} inner={inner} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="p-5 space-y-2">
            <h3 className="font-semibold text-sm">
              {t("tools.career360.legendHeading")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("tools.career360.legendCaption")}
            </p>
            <div className="space-y-1.5 text-sm pt-1">
              {(["good", "moderate", "poor", "unknown"] as const).map((h) => (
                <div key={h} className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ backgroundColor: HEALTH_FILL_COLORS[h] }}
                  />
                  <span>{healthLabels[h]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
