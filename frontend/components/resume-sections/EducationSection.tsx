import { GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Education, SkillEvidence } from "@/types/resume";
import { mergeEducation } from "@shared/skill-evidence";
import { useSectionMerge } from "@/components/useSectionMerge";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";
import { SortableList } from "./SortableList";

interface EducationSectionProps {
  education: Education[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Education, value: string | string[] | null) => void;
  onRemove: (index: number) => void;
  onReorder?: (next: Education[]) => void;
  evidence?: SkillEvidence[];
  onReplaceEducationAndEvidence?: (next: Education[], nextEvidence: SkillEvidence[]) => void;
}

export default function EducationSection({
  education,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
  evidence,
  onReplaceEducationAndEvidence,
}: EducationSectionProps) {
  const merge = useSectionMerge<Education>({
    items: education,
    noun: "education entry",
    nounPlural: "education entries",
    onReplace: onReplaceEducationAndEvidence,
    mergeFn: ({ selectedIndexes, primaryIndex }) => {
      if (!onReplaceEducationAndEvidence) return;
      const result = mergeEducation({
        education,
        evidence: evidence ?? [],
        selectedIndexes,
        primaryIndex,
      });
      onReplaceEducationAndEvidence(result.education, result.evidence);
    },
    renderLabel: (e) => (
      <span>
        <strong>{e.area || e.studyType || "(unnamed)"}</strong>
        {e.institution ? ` · ${e.institution}` : ""}
      </span>
    ),
  });
  const { t } = useTranslation();
  const emptyState = {
    icon: <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: t("messages.empty.education.title"),
    description: t("messages.empty.education.description"),
  };

  return (
    <BaseSectionCard
      title={t("tabs.education")}
      onAdd={onAdd}
      addButtonText={t("actions.addEducation")}
      isEmpty={education.length === 0}
      emptyState={emptyState}
    >
      {merge.bar}
      {merge.tip}
      <SortableList
        items={education}
        getId={(e, i) => e.id ?? `education-idx-${i}`}
        onReorder={onReorder}
      >
        {(edu, index) => (
        <BaseSectionItem
          key={edu.id ?? `education-idx-${index}`}
          id={edu.id}
          collapsedSummary={
            edu.institution || edu.area
              ? `${edu.institution || ""}${edu.area ? ` · ${edu.area}` : ""}`.trim()
              : undefined
          }
          title={
            <span className="inline-flex items-center gap-2">
              {merge.checkbox(index)}
              {t("labels.itemNumber.education", { index: index + 1 })}
            </span>
          }
          onRemove={() => onRemove(index)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("fields.institution.label")}</Label>
              <Input
                value={edu.institution}
                onChange={(e) => onUpdate(index, "institution", e.target.value)}
                placeholder={t("fields.institution.placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("fields.areaOfStudy.label")}</Label>
              <Input
                value={edu.area}
                onChange={(e) => onUpdate(index, "area", e.target.value)}
                placeholder={t("fields.areaOfStudy.placeholder")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("fields.studyType.label")}</Label>
              <Input
                value={edu.studyType}
                onChange={(e) => onUpdate(index, "studyType", e.target.value)}
                placeholder={t("fields.studyType.placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("fields.score.label")}</Label>
              <Input
                value={edu.score}
                onChange={(e) => onUpdate(index, "score", e.target.value)}
                placeholder={t("fields.score.placeholder")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("fields.startDate.label")}</Label>
              <Input
                type="date"
                value={edu.startDate}
                onChange={(e) => onUpdate(index, "startDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("fields.endDate.label")}</Label>
              <Input
                type="date"
                value={edu.endDate}
                onChange={(e) => onUpdate(index, "endDate", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("fields.website.labelShort")}</Label>
            <Input
              value={edu.url}
              onChange={(e) => onUpdate(index, "url", e.target.value)}
              placeholder={t("fields.educationWebsite.placeholder")}
            />
          </div>
        </BaseSectionItem>
        )}
      </SortableList>
    </BaseSectionCard>
  );
}
