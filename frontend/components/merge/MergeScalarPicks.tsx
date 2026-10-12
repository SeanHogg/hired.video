/** "1 field differs: End date" — pick which value a merged entry keeps for
 *  each field the two sides disagree on (target kept by default). */
import { useTranslation } from "react-i18next";
import { mergeFieldLabelKey } from "@/lib/merge/merge-labels";
import type { MergeDecision, ScalarFieldDiffs } from "@/types/resume";
import MergeValuePick from "./MergeValuePick";

interface MergeScalarPicksProps {
  diffs: ScalarFieldDiffs | undefined;
  decision: MergeDecision;
  onDecisionChange: (d: MergeDecision) => void;
  sourceName: string;
  targetName: string;
}

export default function MergeScalarPicks({ diffs, decision, onDecisionChange, sourceName, targetName }: MergeScalarPicksProps) {
  const { t } = useTranslation();
  const entries = Object.entries(diffs ?? {});
  if (entries.length === 0) return null;
  const fieldName = (field: string) => t(mergeFieldLabelKey(field), { field });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-foreground">
        {t("merge.fields.differ", { count: entries.length, fields: entries.map(([f]) => fieldName(f)).join(", ") })}
      </p>
      {entries.map(([field, values]) => (
        <MergeValuePick
          key={field}
          label={entries.length > 1 ? fieldName(field) : undefined}
          sourceValue={values.source}
          targetValue={values.target}
          sourceName={sourceName}
          targetName={targetName}
          value={decision.scalarChoices?.[field]}
          onChange={(side) =>
            onDecisionChange({ ...decision, scalarChoices: { ...(decision.scalarChoices ?? {}), [field]: side } })
          }
        />
      ))}
    </div>
  );
}
