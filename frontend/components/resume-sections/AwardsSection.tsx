import { Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Award as AwardType } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";
import { SortableList } from "./SortableList";

interface AwardsSectionProps {
  awards: AwardType[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof AwardType, value: string) => void;
  onRemove: (index: number) => void;
  onReorder?: (next: AwardType[]) => void;
}

export default function AwardsSection({
  awards,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
}: AwardsSectionProps) {
  const { t } = useTranslation();
  const emptyState = {
    icon: <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: t("messages.empty.awards.title"),
    description: t("messages.empty.awards.description"),
  };

  return (
    <BaseSectionCard
      title={t("tabs.awards")}
      onAdd={onAdd}
      addButtonText={t("actions.addAward")}
      isEmpty={awards.length === 0}
      emptyState={emptyState}
    >
      <SortableList
        items={awards}
        getId={(a, i) => a.id ?? `award-idx-${i}`}
        onReorder={onReorder}
      >
        {(award, index) => (
        <BaseSectionItem
          key={award.id ?? `award-idx-${index}`}
          id={award.id}
          collapsedSummary={
            award.title || award.awarder
              ? `${award.title || ""}${award.awarder ? ` · ${award.awarder}` : ""}`.trim()
              : undefined
          }
          title={t("labels.itemNumber.award", { index: index + 1 })}
          onRemove={() => onRemove(index)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("fields.awardTitle.label")}</Label>
              <Input
                value={award.title}
                onChange={(e) => onUpdate(index, "title", e.target.value)}
                placeholder={t("fields.awardTitle.placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("fields.awarder.label")}</Label>
              <Input
                value={award.awarder}
                onChange={(e) => onUpdate(index, "awarder", e.target.value)}
                placeholder={t("fields.awarder.placeholder")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("fields.date.label")}</Label>
            <Input
              type="date"
              value={award.date}
              onChange={(e) => onUpdate(index, "date", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("fields.summary.label")}</Label>
            <Textarea
              value={award.summary}
              onChange={(e) => onUpdate(index, "summary", e.target.value)}
              placeholder={t("fields.awardSummary.placeholder")}
              rows={3}
            />
          </div>
        </BaseSectionItem>
        )}
      </SortableList>
    </BaseSectionCard>
  );
}
