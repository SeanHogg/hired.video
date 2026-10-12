// Per-row action bar shared by both gap rows and roadmap-step rows in
// the Career 360 plan. Both kinds of items support the same two
// follow-up actions, so the bar is one shared component (DRY rule):
//
//   1. Re-evaluate — POST /api/career360/evaluate, render the verdict
//      inline beneath the row so the seeker can confirm the LLM didn't
//      miss something they already have (e.g. they told us "earn PSPO"
//      but the seeker's resume already lists PSPO).
//   2. Add to Tasks — POST /api/task/save, with `metadata.career360`
//      carrying the source ids + an optional resume-validation hint
//      so /tasks can later auto-validate completion.
//
// Self-gating per the DRY rule: the verdict region returns null when
// no evaluation has been requested yet; the toast handlers swallow
// network errors into a single user-facing toast (no thrown promise
// chain into the parent). The host page passes only the data — no
// `canEvaluate` / `canAddTask` booleans.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, CheckCircle2, ListTodo, Loader2, RefreshCw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { career360Service } from "@/lib/services/career360-service";
import { taskService } from "@/lib/services/task-service";
import { TaskType, ProductivityItemStatus } from "@/types/task";
import {
  isCareerItemResolved,
  type EvaluateRequest,
  type EvaluationResult,
  type Gap,
  type RoadmapStep,
  type SelectedTarget,
} from "@shared/career360-types";

type Source =
  | { kind: "gap"; gap: Gap }
  | { kind: "step"; step: RoadmapStep };

interface Props {
  /** Active target — used for the back-reference + validation hint
   *  saved on the task's metadata (so the Tasks page can later prove
   *  completion against the master resume). */
  target: SelectedTarget;
  source: Source;
  /** Raised after a resolve/reopen persists so the host can swap in the
   *  freshly-saved target (updated `resolvedItems`). When omitted the
   *  mark-done control is hidden — the row is read-only. */
  onTargetUpdated?: (next: SelectedTarget) => void;
}

const VERDICT_STYLES: Record<EvaluationResult["verdict"], string> = {
  closed: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900",
  partial: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900",
  open: "bg-accent text-accent-foreground border-primary/30",
  uncertain: "bg-muted text-foreground border-border",
};

export function CareerItemActions({ target, source, onTargetUpdated }: Props) {
  const { t } = useTranslation();
  const [evaluating, setEvaluating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [verdict, setVerdict] = useState<EvaluationResult | null>(null);
  const [added, setAdded] = useState(false);

  const itemId = source.kind === "gap" ? source.gap.id : source.step.id;
  const resolved = isCareerItemResolved(target, source.kind, itemId);

  const verdictLabel = (v: EvaluationResult["verdict"]) =>
    t(`tools.career360.item.verdict.${v}`);

  const handleEvaluate = async () => {
    if (evaluating) return;
    const request: EvaluateRequest =
      source.kind === "gap"
        ? { gapId: source.gap.id }
        : { roadmapStepId: source.step.id };
    setEvaluating(true);
    try {
      const result = await career360Service.evaluate(request);
      setVerdict(result);
    } catch (err: any) {
      const code = err?.context?.serverCode ?? err?.code;
      const msg = err?.context?.serverMessage ?? err?.message;
      if (code === "NOT_FOUND") {
        toast.error(msg ?? t("tools.career360.item.evalStale"));
      } else {
        toast.error(msg ?? t("tools.career360.item.evalFailed"));
      }
    } finally {
      setEvaluating(false);
    }
  };

  const handleAddToTasks = async () => {
    if (adding) return;
    setAdding(true);
    try {
      await taskService.createTask(buildTaskRequest(target, source));
      setAdded(true);
      toast.success(t("tools.career360.item.toastAdded"));
    } catch (err) {
      toast.error(t("tools.career360.item.toastAddFailed"));
    } finally {
      setAdding(false);
    }
  };

  const handleToggleResolved = async () => {
    if (resolving || !onTargetUpdated) return;
    const next = !resolved;
    setResolving(true);
    try {
      const updated = await career360Service.resolve({
        itemId,
        kind: source.kind,
        resolved: next,
        verdict: verdict?.verdict,
      });
      onTargetUpdated(updated);
      toast.success(
        next
          ? t("tools.career360.item.toastResolved")
          : t("tools.career360.item.toastReopened"),
      );
    } catch (err: any) {
      const msg = err?.context?.serverMessage ?? err?.message;
      toast.error(msg ?? t("tools.career360.item.toastResolveFailed"));
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleEvaluate}
          disabled={evaluating}
          title={t("tools.career360.item.reevaluateTitle")}
        >
          {evaluating ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
          )}
          {t("tools.career360.item.reevaluate")}
        </Button>
        {onTargetUpdated && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleResolved}
            disabled={resolving}
            title={
              resolved
                ? t("tools.career360.item.reopenTitle")
                : t("tools.career360.item.markDoneTitle")
            }
          >
            {resolving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : resolved ? (
              <Undo2 className="mr-1 h-3.5 w-3.5" />
            ) : (
              <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-emerald-600" />
            )}
            {resolved
              ? t("tools.career360.item.reopen")
              : t("tools.career360.item.markDone")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleAddToTasks}
          disabled={adding || added}
          title={t("tools.career360.item.addToTasksTitle")}
        >
          {adding ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : added ? (
            <Check className="mr-1 h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <ListTodo className="mr-1 h-3.5 w-3.5" />
          )}
          {added ? t("tools.career360.item.added") : t("tools.career360.item.addToTasks")}
        </Button>
      </div>
      {verdict && (
        <div
          className={cn(
            "rounded-md border p-2 text-xs space-y-1",
            VERDICT_STYLES[verdict.verdict],
          )}
        >
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              {verdictLabel(verdict.verdict)}
            </Badge>
            {/* A "closed" verdict is the strongest cue to retire the item —
                nudge the seeker toward mark-done right where they'll read it. */}
            {verdict.verdict === "closed" && !resolved && onTargetUpdated && (
              <span className="text-[11px] opacity-80">
                {t("tools.career360.item.closedHint")}
              </span>
            )}
          </div>
          <p>{verdict.explanation}</p>
          {verdict.evidence.length > 0 && (
            <ul className="list-disc list-inside text-[11px] opacity-80">
              {verdict.evidence.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Build the CreateTask payload for a Career 360 gap or step. The
 *  metadata block carries enough context for the Tasks page to render
 *  the back-link AND for a future validator to confirm completion
 *  against the master resume (e.g. "this task says PSPO — does the
 *  resume's certificates list contain PSPO?"). */
function buildTaskRequest(target: SelectedTarget, source: Source) {
  const start = new Date().toISOString();
  if (source.kind === "gap") {
    const { gap } = source;
    return {
      text: `[${target.title}] ${gap.label}`,
      description: [
        `Target: ${target.title}${target.seniority ? ` (${target.seniority})` : ""}`,
        `Today: ${gap.currentValue}`,
        `Goal: ${gap.targetValue}`,
        "",
        "Suggested actions:",
        ...gap.suggestedActions.map((a) => `• ${a}`),
      ].join("\n"),
      start,
      taskType: TaskType.Project,
      status: ProductivityItemStatus.ToDo,
      metadata: {
        career360: {
          source: "gap" as const,
          gapId: gap.id,
          targetId: target.id,
          targetTitle: target.title,
          severity: gap.severity,
          category: gap.category,
        },
        validation: deriveValidationHint(gap.label, gap.targetValue),
      },
    };
  }
  const { step } = source;
  return {
    text: `[${target.title}] ${step.title}`,
    description: [
      `Target: ${target.title}${target.seniority ? ` (${target.seniority})` : ""}`,
      `Horizon: ${step.horizon}`,
      "",
      step.detail,
    ].join("\n"),
    start,
    taskType: TaskType.Project,
    status: ProductivityItemStatus.ToDo,
    metadata: {
      career360: {
        source: "step" as const,
        roadmapStepId: step.id,
        targetId: target.id,
        targetTitle: target.title,
        horizon: step.horizon,
        closesGapIds: step.closesGapIds,
      },
      validation: deriveValidationHint(step.title, step.detail),
    },
  };
}

/** Lightweight pattern-matcher: turns "Earn AWS Solutions Architect
 *  Associate" / "Get PSPO certified" into a `{ type: 'cert', patterns }`
 *  validation hint the Tasks page can use to scan the master resume.
 *  Returns null when no obvious validation rule applies — better to
 *  leave the task as a manual checkmark than to validate the wrong
 *  thing. */
function deriveValidationHint(
  title: string,
  context: string,
): { type: "cert"; patterns: string[] } | null {
  const haystack = `${title}\n${context}`.toLowerCase();
  // Common credential acronyms / full names that map cleanly. Keep this
  // list small and high-signal — false positives turn a green check
  // into a credibility hit.
  const CERT_PATTERNS: Array<{ match: RegExp; patterns: string[] }> = [
    { match: /\bpspo\b|certified scrum product owner/i, patterns: ["PSPO", "Certified Scrum Product Owner"] },
    { match: /\bpsm\b|certified scrum master|professional scrum master/i, patterns: ["PSM", "Certified Scrum Master", "Professional Scrum Master"] },
    { match: /\bpmp\b|project management professional/i, patterns: ["PMP", "Project Management Professional"] },
    { match: /aws.*solutions architect|aws sa\b/i, patterns: ["AWS Solutions Architect", "AWS SA"] },
    { match: /aws.*machine learning.*specialty/i, patterns: ["AWS Certified Machine Learning"] },
    { match: /\bcfa\b|chartered financial analyst/i, patterns: ["CFA", "Chartered Financial Analyst"] },
    { match: /\bcissp\b/i, patterns: ["CISSP"] },
    { match: /google cloud.*architect|gcp.*architect/i, patterns: ["Google Cloud Architect", "GCP"] },
    { match: /azure.*architect/i, patterns: ["Azure Solutions Architect"] },
  ];
  for (const { match, patterns } of CERT_PATTERNS) {
    if (match.test(haystack)) {
      return { type: "cert", patterns };
    }
  }
  return null;
}
