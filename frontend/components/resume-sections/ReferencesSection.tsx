import { UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Reference } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";

interface ReferencesSectionProps {
  references: Reference[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Reference, value: string) => void;
  onRemove: (index: number) => void;
}

export default function ReferencesSection({
  references,
  onAdd,
  onUpdate,
  onRemove,
}: ReferencesSectionProps) {
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
      {references.map((ref, index) => (
        <BaseSectionItem
          key={index}
          title={t("labels.itemNumber.reference", { index: index + 1 })}
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
      ))}
    </BaseSectionCard>
  );
}
