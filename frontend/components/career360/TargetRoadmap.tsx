// Career 360 roadmap view. Renders the locked-in target, the LLM-derived
// rubric (must-have / nice-to-have / certs / narrative), the prioritized
// gap list, and the time-bucketed roadmap. Each gap that maps to a
// catalog tool gets a deep-link button — same pattern as the existing
// per-entity action menus, no prop-drilled feature flags.

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  Sparkles,
  Target as TargetIcon,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getCatalogTool } from "@/data/tools-catalog";
import { CareerItemActions } from "@/components/career360/CareerItemActions";
import type { Gap, RoadmapStep, SelectedTarget } from "@shared/career360-types";

interface Props {
  selected: SelectedTarget;
  isRefreshing: boolean;
  isClearing: boolean;
  onRefresh: () => void;
  onClear: () => void;
  /** Open AI Coach with a per-gap priming message. Owned by Career360
   *  page so the page-context (master resume, target snapshot) stays
   *  in one place — the Roadmap just raises the gap, the page builds
   *  the prompt + context. */
  onCoachGap: (gap: Gap) => void;
}

const SEVERITY_STYLES: Record<Gap["severity"], string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-muted text-foreground border-border",
};

export function TargetRoadmap({
  selected,
  isRefreshing,
  isClearing,
  onRefresh,
  onClear,
  onCoachGap,
}: Props) {
  const { t } = useTranslation();
  const orderedGaps = useMemo(
    () =>
      [...selected.gaps].sort((a, b) => {
        const rank = (s: Gap["severity"]) => (s === "high" ? 0 : s === "medium" ? 1 : 2);
        return rank(a.severity) - rank(b.severity);
      }),
    [selected.gaps],
  );

  const stepsByHorizon = useMemo(() => {
    const map: Record<RoadmapStep["horizon"], RoadmapStep[]> = {
      "30d": [],
      "60d": [],
      "90d": [],
      "180d": [],
    };
    for (const step of selected.roadmap) map[step.horizon].push(step);
    return map;
  }, [selected.roadmap]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 text-brand-purple flex items-center justify-center shrink-0">
                <TargetIcon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">
                  {t("tools.career360.roadmap.targetPrefix")} {selected.title}
                  {selected.seniority && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      {selected.seniority}
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {selected.description}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button asChild variant="outline" size="sm">
                <Link
                  to={`/tools/interview-questions?source=career-360&targetRole=${encodeURIComponent(
                    selected.title,
                  )}${selected.seniority ? `&seniority=${encodeURIComponent(selected.seniority)}` : ""}`}
                >
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  {t("tools.career360.roadmap.generateQuestions")}
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing || isClearing}
              >
                {isRefreshing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {t("tools.career360.roadmap.refreshPlan")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                disabled={isRefreshing || isClearing}
              >
                {isClearing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                {t("tools.career360.roadmap.changeTarget")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">
                {t("tools.career360.roadmap.mustHave")}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {selected.rubric.mustHaveSkills.length === 0 ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  selected.rubric.mustHaveSkills.map((s) => (
                    <Badge key={s} variant="secondary" className="text-[11px]">
                      {s}
                    </Badge>
                  ))
                )}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">
                {t("tools.career360.roadmap.niceToHave")}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {selected.rubric.niceToHaveSkills.length === 0 ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  selected.rubric.niceToHaveSkills.map((s) => (
                    <Badge key={s} variant="outline" className="text-[11px]">
                      {s}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </div>

          {(selected.rubric.expectedYearsExperience ||
            selected.rubric.expectedCertifications.length > 0 ||
            selected.rubric.narrativeHook) && (
            <>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                {selected.rubric.expectedYearsExperience && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-1">
                      {t("tools.career360.roadmap.experience")}
                    </h4>
                    <p>{selected.rubric.expectedYearsExperience}</p>
                  </div>
                )}
                {selected.rubric.expectedCertifications.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-1">
                      {t("tools.career360.roadmap.certifications")}
                    </h4>
                    <p>{selected.rubric.expectedCertifications.join(", ")}</p>
                  </div>
                )}
                {selected.rubric.narrativeHook && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-1">
                      {t("tools.career360.roadmap.narrativeHook")}
                    </h4>
                    <p className="italic">{selected.rubric.narrativeHook}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("tools.career360.roadmap.gaps")}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("tools.career360.roadmap.gapsHint")}
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {orderedGaps.map((gap) => {
            const tool = gap.toolId ? getCatalogTool(gap.toolId) : undefined;
            return (
              <div
                key={gap.id}
                className="rounded-md border p-3 hover:bg-accent/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", SEVERITY_STYLES[gap.severity])}
                      >
                        {gap.severity.toUpperCase()}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {t(`tools.career360.roadmap.category.${gap.category}`)}
                      </Badge>
                      <span className="font-medium text-sm">{gap.label}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                      <p>
                        <span className="font-semibold">{t("tools.career360.roadmap.today")}</span> {gap.currentValue}
                      </p>
                      <p>
                        <span className="font-semibold">{t("tools.career360.roadmap.targetPrefix")}</span> {gap.targetValue}
                      </p>
                    </div>
                    <ul className="mt-2 space-y-0.5 text-sm">
                      {gap.suggestedActions.map((a, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {tool && (
                      <Button asChild variant="outline" size="sm">
                        <Link to={tool.href}>
                          {t("tools.career360.roadmap.open", { tool: tool.title })}
                          <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onCoachGap(gap)}
                    >
                      <Sparkles className="mr-1 h-3.5 w-3.5" />
                      {t("tools.career360.roadmap.coachMe")}
                    </Button>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-border/60">
                  <CareerItemActions
                    target={selected}
                    source={{ kind: "gap", gap }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("tools.career360.roadmap.title")}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("tools.career360.roadmap.hint")}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["30d", "60d", "90d", "180d"] as const).map((h) => {
            const steps = stepsByHorizon[h];
            if (steps.length === 0) return null;
            return (
              <div key={h}>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">
                  {t(`tools.career360.roadmap.horizon.${h}`)}
                </h4>
                <ol className="space-y-2">
                  {steps.map((step) => (
                    <li key={step.id} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm">{step.title}</p>
                        {step.closesGapIds.length > 0 && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {t("tools.career360.roadmap.closesGaps", {
                              count: step.closesGapIds.length,
                            })}
                          </Badge>
                        )}
                      </div>
                      {step.detail && (
                        <p className="text-xs text-muted-foreground mt-1">{step.detail}</p>
                      )}
                      <div className="mt-2 pt-2 border-t border-border/60">
                        <CareerItemActions
                          target={selected}
                          source={{ kind: "step", step }}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
