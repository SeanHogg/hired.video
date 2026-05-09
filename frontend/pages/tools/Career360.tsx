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
import { useNavigate } from "react-router-dom";
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
  HEALTH_LABELS,
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
import { resumeService } from "@/lib/services/resume-service";
import { toast } from "sonner";
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

/** Roll up gaps into per-segment health: highest severity wins. */
function computeWheelHealth(gaps: Gap[]): Record<string, SegmentHealth> {
  const health: Record<string, SegmentHealth> = {};
  for (const gap of gaps) {
    const segment = CATEGORY_TO_SEGMENT[gap.category];
    if (!segment) continue;
    const next = severityToHealth(gap.severity);
    const cur = health[segment];
    if (!cur || rank(next) < rank(cur)) {
      health[segment] = next;
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
  const { isAuthenticated, user } = useAuth();
  const { openAIWithPageContextAndMessage } = useAI();
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
          toast.error("Couldn't load Career 360 — try refreshing.");
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
    () => (selected ? computeWheelHealth(selected.gaps) : {}),
    [selected],
  );

  const outer: WheelSignal[] = useMemo(
    () =>
      OUTER_BLUEPRINT.map((b) => ({
        ...b,
        health: wheelHealth[b.id] ?? "unknown",
      })),
    [wheelHealth],
  );

  // Inner ring = outcomes. We don't measure these yet (#413), so they
  // stay "unknown" until score history shows up; that's intentional —
  // better grey than misleading green.
  const inner: WheelSignal[] = useMemo(
    () => INNER_BLUEPRINT.map((b) => ({ ...b, health: "unknown" as SegmentHealth })),
    [],
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
      }));
    } catch (err) {
      console.error("[career360] suggest failed", err);
      toast.error("Couldn't generate target suggestions — try again.");
    } finally {
      setSuggesting(false);
    }
  };

  const handleSelect = async (suggestionId: string) => {
    setSelecting(true);
    try {
      const next = await career360Service.select({ fromSuggestionId: suggestionId });
      setState((prev) => ({
        doc: { ...(prev?.doc ?? {}), selected: next },
        history: prev?.history ?? [],
      }));
    } catch (err) {
      console.error("[career360] select failed", err);
      toast.error("Couldn't build the plan — try a different target or refresh.");
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
      setState((prev) => ({
        doc: { ...(prev?.doc ?? {}), selected: next },
        history: prev?.history ?? [],
      }));
    } catch (err) {
      console.error("[career360] custom select failed", err);
      toast.error("Couldn't build the plan for that target.");
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
      setState((prev) => ({
        doc: { ...(prev?.doc ?? {}), selected: next },
        history: prev?.history ?? [],
      }));
      toast.success("Plan refreshed.");
    } catch (err) {
      console.error("[career360] refresh plan failed", err);
      toast.error("Couldn't refresh the plan.");
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
      toast.error("Couldn't clear the target.");
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
      containerClassName="max-w-7xl mx-auto"
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
                      <h3 className="font-semibold text-sm">Health legend</h3>
                      <div className="space-y-1.5 text-sm">
                        {(["good", "moderate", "poor", "unknown"] as const).map((h) => (
                          <div key={h} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block h-3 w-3 rounded-sm"
                                style={{ backgroundColor: HEALTH_FILL_COLORS[h] }}
                              />
                              <span>{HEALTH_LABELS[h]}</span>
                            </div>
                            <Badge variant="secondary" className="font-mono">
                              {counts[h]}
                            </Badge>
                          </div>
                        ))}
                      </div>
                      {!selected && (
                        <p className="text-xs text-muted-foreground">
                          Pick a target below to color the wheel from your gap analysis.
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {history.length > 0 && (
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        <h3 className="font-semibold text-sm">Stamps of improvement</h3>
                        <p className="text-xs text-muted-foreground">
                          Every recorded run of a measured tool — points improve as you close gaps.
                        </p>
                        <div className="space-y-3 pt-1">
                          {history.map((series: ScoreHistorySeries) => (
                            <div key={series.toolId}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="font-medium">{series.label}</span>
                                <span className="text-muted-foreground">
                                  {series.points.length} run
                                  {series.points.length === 1 ? "" : "s"}
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
                  <span>{HEALTH_LABELS[h]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
