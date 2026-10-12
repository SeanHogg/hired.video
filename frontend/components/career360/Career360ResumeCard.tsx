// Condensed Career 360 surface for the resume View page. Turns Career
// 360 into a key job-seeker touchpoint by putting it one click from the
// resume:
//   - Never run it → a "Run Career 360" card that opens the full tool in
//     a right-hand slide-out panel (the same reusable <Career360Body />
//     that powers /tools/career-360, so nothing is duplicated).
//   - Already run → a compact readout: target, readiness meter, open vs.
//     resolved counts, and the next few roadmap steps, with an "Open
//     plan" button into the same slide-out to manage the actions.
//
// Self-gating per the DRY rule: the component decides its own visibility
// from the server-trusted `isOwner` flag — the host passes data, not a
// `canShow` boolean. Career 360's API is "me"-scoped, so this only ever
// reflects the signed-in owner's own plan.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Compass, Loader2, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { career360Service, type Career360State } from "@/lib/services/career360-service";
import { Career360Body } from "@/components/career360/Career360Body";
import { computeTargetReadiness } from "@/lib/tools/career360-run-result";
import {
  isCareerItemResolved,
  openGaps,
  type RoadmapStep,
  type SelectedTarget,
} from "@shared/career360-types";

const HORIZON_ORDER: RoadmapStep["horizon"][] = ["30d", "60d", "90d", "180d"];

/** Readiness band → fill color, driven by theme-safe Tailwind tokens so
 *  it reads in both light and dark mode. */
function readinessFill(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

/** The next unresolved roadmap steps in horizon order — what the seeker
 *  should tackle now. */
function nextSteps(target: SelectedTarget, limit: number): RoadmapStep[] {
  const open = target.roadmap.filter(
    (s) => !isCareerItemResolved(target, "step", s.id),
  );
  return [...open]
    .sort((a, b) => HORIZON_ORDER.indexOf(a.horizon) - HORIZON_ORDER.indexOf(b.horizon))
    .slice(0, limit);
}

interface Props {
  /** Server-trusted ownership flag from the resume. The card renders only
   *  for the owner viewing their own resume. */
  isOwner: boolean;
}

export function Career360ResumeCard({ isOwner }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<Career360State | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      const next = await career360Service.getState();
      setState(next);
    } catch (err) {
      console.error("[career360-card] load failed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    (async () => {
      try {
        const next = await career360Service.getState();
        if (!cancelled) setState(next);
      } catch (err) {
        console.error("[career360-card] load failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  // Refetch when the slide-out closes so any target/resolve changes made
  // in the panel are reflected in the condensed card.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) void load();
  };

  if (!isOwner) return null;

  const selected = state?.doc?.selected ?? null;

  const header = (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
        <Compass className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold text-base leading-tight">
          {t("tools.career360.title")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t("tools.career360.card.subtitle")}
        </p>
      </div>
    </div>
  );

  return (
    <>
      <Card>
        <CardContent className="p-5 space-y-4">
          {header}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("status.loading")}
            </div>
          ) : !selected ? (
            // Never run — invite the seeker to start.
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("tools.career360.card.pitch")}
              </p>
              <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
                <Sparkles className="mr-2 h-4 w-4" />
                {t("tools.career360.card.runCta")}
              </Button>
            </div>
          ) : (
            <Career360ResumeCardSummary
              selected={selected}
              onOpen={() => setOpen(true)}
            />
          )}
        </CardContent>
      </Card>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-4xl overflow-y-auto p-6"
        >
          <SheetHeader className="mb-2">
            <SheetTitle className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-brand-primary" />
              {t("tools.career360.sheet.title")}
            </SheetTitle>
            <SheetDescription>
              {t("tools.career360.sheet.description")}
            </SheetDescription>
          </SheetHeader>
          {/* Mount the full tool only while the panel is open so it fetches
              fresh state each time and doesn't run in the background. The
              "panel" variant packs the wheel + legend onto one row so the
              narrower surface has no dead vertical space. */}
          {open && <Career360Body variant="panel" />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Career360ResumeCardSummary({
  selected,
  onOpen,
}: {
  selected: SelectedTarget;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const open = openGaps(selected);
  const readiness = computeTargetReadiness(open);
  const resolvedCount = (selected.resolvedItems ?? []).length;
  const steps = nextSteps(selected, 3);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">
          {t("tools.career360.roadmap.targetPrefix")}
        </span>
        <span className="font-medium text-sm">{selected.title}</span>
        {selected.seniority && (
          <Badge variant="secondary" className="text-[10px]">
            {selected.seniority}
          </Badge>
        )}
      </div>

      {/* Readiness meter */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">{t("tools.career360.card.readiness")}</span>
          <span className="font-mono text-muted-foreground">{readiness}%</span>
        </div>
        <div
          className="h-2 w-full rounded-full bg-muted overflow-hidden"
          role="progressbar"
          aria-valuenow={readiness}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn("h-full rounded-full transition-all", readinessFill(readiness))}
            style={{ width: `${readiness}%` }}
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-0.5">
          <span>{t("tools.career360.card.openGaps", { count: open.length })}</span>
          {resolvedCount > 0 && (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("tools.career360.card.resolvedCount", { count: resolvedCount })}
            </span>
          )}
        </div>
      </div>

      {/* Next steps */}
      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("tools.career360.card.nextSteps")}
        </h4>
        {steps.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("tools.career360.card.allResolved")}
          </p>
        ) : (
          <ul className="space-y-1">
            {steps.map((step) => (
              <li key={step.id} className="flex items-start gap-2 text-sm">
                <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">
                  {t(`tools.career360.roadmap.horizon.${step.horizon}`)}
                </Badge>
                <span className="min-w-0 truncate">{step.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button variant="outline" size="sm" onClick={onOpen} className="w-full sm:w-auto">
        {t("tools.career360.card.openCta")}
        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
