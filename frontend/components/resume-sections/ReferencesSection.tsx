import { UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Reference } from "@/types/resume";
import { mergeReferences } from "@shared/skill-evidence";
import { useSectionMerge } from "@/components/useSectionMerge";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";
import { SortableList } from "./SortableList";

interface ReferencesSectionProps {
  references: Reference[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Reference, value: string) => void;
  onRemove: (index: number) => void;
  onReorder?: (next: Reference[]) => void;
  onReplaceReferences?: (next: Reference[]) => void;
}

export default function ReferencesSection({
  references,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
  onReplaceReferences,
}: ReferencesSectionProps) {
  const merge = useSectionMerge<Reference>({
    items: references,
    noun: "reference",
    onReplace: onReplaceReferences,
    mergeFn: ({ selectedIndexes, primaryIndex }) => {
      if (!onReplaceReferences) return;
      const result = mergeReferences({ references, selectedIndexes, primaryIndex });
      onReplaceReferences(result.references);
    },
    renderLabel: (r) => <strong>{r.name || "(unnamed)"}</strong>,
  });
  const { t } = useTranslation();
  const emptyState = {
    icon: <UserCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: t("messages.empty.references.title"),
    description: t("messages.empty.references.description"),
  };

  return (
    <BaseSectionCard
      title={t("tabs.references")}
      onAdd={onAdd}
      addButtonText={t("actions.addReference")}
      isEmpty={references.length === 0}
      emptyState={emptyState}
    >
      {merge.bar}
      {merge.tip}
      <SortableList
        items={references}
        getId={(r, i) => r.id ?? `reference-idx-${i}`}
        onReorder={onReorder}
      >
        {(ref, index) => (
        <BaseSectionItem
          key={ref.id ?? `reference-idx-${index}`}
          id={ref.id}
          collapsedSummary={ref.name || undefined}
          title={
            <span className="inline-flex items-center gap-2">
              {merge.checkbox(index)}
              {t("labels.itemNumber.reference", { index: index + 1 })}
            </span>
          }
          onRemove={() => onRemove(index)}
        >
          <div className="space-y-2">
            <Label>{t("fields.referenceName.label")}</Label>
            <Input
              value={ref.name}
              onChange={(e) => onUpdate(index, "name", e.target.value)}
              placeholder={t("fields.referenceName.placeholder")}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("fields.referenceDetails.label")}</Label>
            <Textarea
              value={ref.reference}
              onChange={(e) => onUpdate(index, "reference", e.target.value)}
              placeholder={t("fields.referenceDetails.placeholder")}
              rows={4}
            />
          </div>
        </BaseSectionItem>
        )}
      </SortableList>
    </BaseSectionCard>
  );
}
