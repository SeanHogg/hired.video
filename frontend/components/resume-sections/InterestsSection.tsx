import { Lightbulb, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Interest } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";
import { SortableList } from "./SortableList";

interface InterestsSectionProps {
  interests: Interest[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Interest, value: string | string[]) => void;
  onRemove: (index: number) => void;
  onReorder?: (next: Interest[]) => void;
}

export default function InterestsSection({
  interests,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
}: InterestsSectionProps) {
  const { t } = useTranslation();
  const emptyState = {
    icon: <Lightbulb className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: t("messages.empty.interests.title"),
    description: t("messages.empty.interests.description"),
  };

  const addKeyword = (interestIndex: number) => {
    const updatedKeywords = [...interests[interestIndex].keywords, ""];
    onUpdate(interestIndex, "keywords", updatedKeywords);
  };

  const updateKeyword = (interestIndex: number, keywordIndex: number, value: string) => {
    const updatedKeywords = [...interests[interestIndex].keywords];
    updatedKeywords[keywordIndex] = value;
    onUpdate(interestIndex, "keywords", updatedKeywords);
  };

  const removeKeyword = (interestIndex: number, keywordIndex: number) => {
    const updatedKeywords = interests[interestIndex].keywords.filter((_, i) => i !== keywordIndex);
    onUpdate(interestIndex, "keywords", updatedKeywords);
  };

  return (
    <BaseSectionCard
      title={t("tabs.interests")}
      onAdd={onAdd}
      addButtonText={t("actions.addInterest")}
      isEmpty={interests.length === 0}
      emptyState={emptyState}
    >
      <SortableList
        items={interests}
        getId={(it, i) => it.id ?? `interest-idx-${i}`}
        onReorder={onReorder}
      >
        {(interest, index) => (
        <BaseSectionItem
          key={interest.id ?? `interest-idx-${index}`}
          id={interest.id}
          collapsedSummary={
            interest.name
              ? `${interest.name}${interest.keywords && interest.keywords.length > 0 ? ` · ${interest.keywords.slice(0, 3).join(", ")}${interest.keywords.length > 3 ? "…" : ""}` : ""}`
              : undefined
          }
          title={t("labels.itemNumber.interest", { index: index + 1 })}
          onRemove={() => onRemove(index)}
        >
          <div className="space-y-2">
            <Label>{t("fields.interestName.label")}</Label>
            <Input
              value={interest.name}
              onChange={(e) => onUpdate(index, "name", e.target.value)}
              placeholder={t("fields.interestName.placeholder")}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("fields.relatedKeywords.label")}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addKeyword(index)}
              >
                {t("actions.addKeyword")}
              </Button>
            </div>
            <div className="space-y-2">
              {interest.keywords.map((keyword, keywordIndex) => (
                <div key={keywordIndex} className="flex gap-2">
                  <Input
                    value={keyword}
                    onChange={(e) => updateKeyword(index, keywordIndex, e.target.value)}
                    placeholder={t("fields.keyword.placeholder")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeKeyword(index, keywordIndex)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </BaseSectionItem>
        )}
      </SortableList>
    </BaseSectionCard>
  );
}
