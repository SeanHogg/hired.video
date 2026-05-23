import { Heart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Volunteer, SkillEvidence } from "@/types/resume";
import { mergeVolunteer } from "@shared/skill-evidence";
import { useSectionMerge } from "@/components/useSectionMerge";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";
import HighlightsEditor from "./HighlightsEditor";
import { SortableList } from "./SortableList";
import XyzTextWand from "./XyzTextWand";

interface VolunteerSectionProps {
  volunteer: Volunteer[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Volunteer, value: string | string[] | null) => void;
  onRemove: (index: number) => void;
  onReorder?: (next: Volunteer[]) => void;
  evidence?: SkillEvidence[];
  onReplaceVolunteerAndEvidence?: (next: Volunteer[], nextEvidence: SkillEvidence[]) => void;
}

export default function VolunteerSection({
  volunteer,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
  evidence,
  onReplaceVolunteerAndEvidence,
}: VolunteerSectionProps) {
  const merge = useSectionMerge<Volunteer>({
    items: volunteer,
    noun: "volunteer entry",
    nounPlural: "volunteer entries",
    onReplace: onReplaceVolunteerAndEvidence,
    mergeFn: ({ selectedIndexes, primaryIndex }) => {
      if (!onReplaceVolunteerAndEvidence) return;
      const result = mergeVolunteer({
        volunteer,
        evidence: evidence ?? [],
        selectedIndexes,
        primaryIndex,
      });
      onReplaceVolunteerAndEvidence(result.volunteer, result.evidence);
    },
    renderLabel: (v) => (
      <span>
        <strong>{v.position || "(no position)"}</strong>
        {v.organization ? ` · ${v.organization}` : ""}
      </span>
    ),
    tipText:
      "Tip: tick two or more volunteer entries to merge duplicates (e.g. the same role pulled in from two resume imports).",
  });
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
      {merge.bar}
      {merge.tip}
      <SortableList
        items={volunteer}
        getId={(v, i) => v.id ?? `volunteer-idx-${i}`}
        onReorder={onReorder}
      >
        {(vol, index) => (
        <BaseSectionItem
          key={vol.id ?? `volunteer-idx-${index}`}
          id={vol.id}
          collapsedSummary={
            vol.position || vol.organization
              ? `${vol.position || ""}${vol.organization ? ` · ${vol.organization}` : ""}`.trim()
              : undefined
          }
          title={
            <span className="inline-flex items-center gap-2">
              {merge.checkbox(index)}
              {t("labels.itemNumber.volunteer", { index: index + 1 })}
            </span>
          }
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
              <div className="flex items-center justify-between">
                <Label>{t("fields.position.label")}</Label>
                <XyzTextWand
                  kind="position"
                  value={vol.position}
                  onChange={(next) => onUpdate(index, "position", next)}
                  context={{ organization: vol.organization }}
                />
              </div>
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
            <div className="flex items-center justify-between">
              <Label>{t("fields.summary.label")}</Label>
              <XyzTextWand
                kind="summary"
                value={vol.summary}
                onChange={(next) => onUpdate(index, "summary", next)}
                context={{
                  role: vol.position,
                  organization: vol.organization,
                  highlights: vol.highlights,
                }}
              />
            </div>
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
            aiContext={{
              role: vol.position,
              organization: vol.organization,
              summary: vol.summary,
            }}
          />
        </BaseSectionItem>
        )}
      </SortableList>
    </BaseSectionCard>
  );
}
