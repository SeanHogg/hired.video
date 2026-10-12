/**
 * A matched entry, decided ON the page above the entry it changes:
 * confidence, why it matched, the action (Merge / Replace / Add as new /
 * Skip), the fields that differ and the bullet checklist (in both / new,
 * AI consolidate). An entry the engine was unsure about is in the "Needs
 * you" queue until it is touched or confirmed. A confident match with
 * nothing to decide shows only its badge.
 */
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import MergeActionSelect from "@/components/merge/MergeActionSelect";
import MergeBulletPicker from "@/components/merge/MergeBulletPicker";
import MergeConfidenceBadge from "@/components/merge/MergeConfidenceBadge";
import MergeScalarPicks from "@/components/merge/MergeScalarPicks";
import { describeMergeItem } from "@/lib/merge/merge-labels";
import type { MergeReview } from "@/lib/build/review/use-merge-review";
import type { MergeDecision, SectionMatch } from "@/types/resume";
import CardShell from "./CardShell";
import { useMergeSideNames } from "./side-names";

interface MatchCardProps {
  review: MergeReview;
  match: SectionMatch;
  decisionIndex: number;
  number?: number;
}

export default function MatchCard({ review, match, decisionIndex, number }: MatchCardProps) {
  const { t } = useTranslation();
  const names = useMergeSideNames(review);
  const decision = review.decisions.decisions[decisionIndex];
  const source = (review.sourceContent?.[match.sectionType] as Array<Record<string, unknown>> | undefined)?.[match.sourceIndex];
  const baseline = (review.baseline ?? {}) as Record<string, unknown>;
  const target =
    match.targetIndex !== null
      ? ((baseline[match.sectionType] as Array<Record<string, unknown>> | undefined)?.[match.targetIndex] ?? null)
      : null;
  if (!decision || !source) return null;

  const queueId = `match:${match.sectionType}:${match.sourceIndex}`;
  const queued = review.queue.find((q) => q.id === queueId);
  const change = (d: MergeDecision) => {
    review.decisions.setDecision(decisionIndex, d);
    if (queued) review.resolve(queueId);
  };
  const differs = !!match.hasContentDifferences || Object.keys(match.scalarDiffs ?? {}).length > 0;
  const badge = <MergeConfidenceBadge confidence={match.confidence} action={match.mergeAction} />;

  if (!queued && !differs) {
    return (
      <div className="my-1 flex flex-wrap items-center gap-2 font-sans text-xs text-muted-foreground">
        {badge}
        {t("review.merge.autoMerged")}
      </div>
    );
  }

  const d = describeMergeItem(match.sectionType, source);
  return (
    <CardShell
      queueId={queued ? queueId : undefined}
      number={number}
      needsYou={queued ? !queued.done : false}
      title={t(match.targetIndex !== null ? "review.merge.sameEntry" : "review.merge.weakMatch", { name: d.label || t(d.fallbackKey) })}
      badges={
        <>
          {badge}
          <span className="text-xs text-muted-foreground">{match.matchReason}</span>
          <span className="flex-1" />
          <MergeActionSelect value={decision.action} hasTarget={target !== null} onChange={(action) => change({ ...decision, action })} />
        </>
      }
    >
      {decision.action === "merge" && (
        <>
          <MergeScalarPicks
            diffs={match.scalarDiffs}
            decision={decision}
            onDecisionChange={change}
            sourceName={names.source}
            targetName={names.target}
          />
          <MergeBulletPicker
            sectionType={match.sectionType}
            entryLabel={[d.label, d.secondary].filter(Boolean).join(" · ")}
            sourceHighlights={Array.isArray(source.highlights) ? (source.highlights as string[]) : []}
            targetHighlights={Array.isArray(target?.highlights) ? (target.highlights as string[]) : []}
            decision={decision}
            onDecisionChange={change}
          />
        </>
      )}
      {queued && !queued.done && (
        <Button size="sm" variant="outline" className="min-h-11 self-start sm:min-h-9" onClick={() => review.resolve(queueId)}>
          {t("review.merge.looksRight")}
        </Button>
      )}
    </CardShell>
  );
}
