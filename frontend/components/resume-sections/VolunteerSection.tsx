import { Heart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Volunteer } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";
import HighlightsEditor from "./HighlightsEditor";

interface VolunteerSectionProps {
  volunteer: Volunteer[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Volunteer, value: string | string[] | null) => void;
  onRemove: (index: number) => void;
}

export default function VolunteerSection({
  volunteer,
  onAdd,
  onUpdate,
  onRemove,
}: VolunteerSectionProps) {
  const { t } = useTranslation();
  const emptyState = {
    icon: <Heart className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: t("messages.empty.volunteer.title"),
    description: t("messages.empty.volunteer.description"),
  };

  return (
    <BaseSectionCard
      title={t("headings.volunteerExperience")}
      onAdd={onAdd}
      addButtonText={t("actions.addVolunteerExperience")}
      isEmpty={volunteer.length === 0}
      emptyState={emptyState}
    >
      {volunteer.map((vol, index) => (
        <BaseSectionItem
          key={index}
          title={t("labels.itemNumber.volunteer", { index: index + 1 })}
          onRemove={() => onRemove(index)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("fields.organization.label")}</Label>
              <Input
                value={vol.organization}
                onChange={(e) => onUpdate(index, "organization", e.target.value)}
                placeholder={t("fields.organization.placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("fields.position.label")}</Label>
              <Input
                value={vol.position}
                onChange={(e) => onUpdate(index, "position", e.target.value)}
                placeholder={t("fields.volunteerPosition.placeholder")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("fields.startDate.label")}</Label>
              <Input
                type="date"
                value={vol.startDate}
                onChange={(e) => onUpdate(index, "startDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("fields.endDate.label")}</Label>
              <Input
                type="date"
                value={vol.endDate}
                onChange={(e) => onUpdate(index, "endDate", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("fields.website.labelShort")}</Label>
            <Input
              value={vol.url}
              onChange={(e) => onUpdate(index, "url", e.target.value)}
              placeholder={t("fields.volunteerWebsite.placeholder")}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("fields.summary.label")}</Label>
            <Textarea
              value={vol.summary}
              onChange={(e) => onUpdate(index, "summary", e.target.value)}
              placeholder={t("fields.volunteerSummary.placeholder")}
              rows={3}
            />
          </div>

          <HighlightsEditor
            highlights={vol.highlights}
            onChange={(next) => onUpdate(index, "highlights", next)}
            label={t("fields.keyHighlights.label")}
            addButtonText={t("actions.addHighlight")}
            placeholder={t("fields.highlight.placeholder")}
          />
        </BaseSectionItem>
      ))}
    </BaseSectionCard>
  );
}
