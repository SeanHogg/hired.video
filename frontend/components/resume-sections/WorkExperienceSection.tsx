import { Briefcase } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Work } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";
import HighlightsEditor from "./HighlightsEditor";
import { SortableList } from "./SortableList";

interface WorkExperienceSectionProps {
  work: Work[];
  /** Deprecated — kept for backward compatibility while callers migrate.
   *  Was used to seed a chronological display order; replaced by manual
   *  drag reordering via `onReorder`. The array order in `work` is now
   *  the canonical display order. */
  sortedWork?: Work[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Work, value: string | string[]) => void;
  onRemove: (index: number) => void;
  /** When provided, items are draggable and the post-drop array is sent
   *  here. Without it, the section renders flat (no drag affordance). */
  onReorder?: (next: Work[]) => void;
}

export default function WorkExperienceSection({
  work,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
}: WorkExperienceSectionProps) {
  const { t } = useTranslation();
  const emptyState = {
    icon: <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: t("messages.empty.work.title"),
    description: t("messages.empty.work.description"),
  };

  return (
    <BaseSectionCard
      title={t("headings.workExperience")}
      onAdd={onAdd}
      addButtonText={t("actions.addWorkExperience")}
      isEmpty={work.length === 0}
      emptyState={emptyState}
    >
      <SortableList
        items={work}
        getId={(w, i) => w.id ?? `work-idx-${i}`}
        onReorder={onReorder}
      >
        {(workItem, index) => (
          <BaseSectionItem
            key={workItem.id ?? `work-idx-${index}`}
            id={workItem.id}
            collapsedSummary={
              workItem.position || workItem.name
                ? `${workItem.position || ""}${workItem.name ? ` · ${workItem.name}` : ""}`.trim()
                : undefined
            }
            title={t("labels.itemNumber.work", { index: index + 1 })}
            onRemove={() => onRemove(index)}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("fields.company.label")}</Label>
                <Input
                  value={workItem.name}
                  onChange={(e) => onUpdate(index, "name", e.target.value)}
                  placeholder={t("fields.company.placeholder")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("fields.position.label")}</Label>
                <Input
                  value={workItem.position}
                  onChange={(e) => onUpdate(index, "position", e.target.value)}
                  placeholder={t("fields.position.placeholder")}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("fields.startDate.label")}</Label>
                <Input
                  type="date"
                  value={workItem.startDate}
                  onChange={(e) => onUpdate(index, "startDate", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("fields.endDate.label")}</Label>
                <Input
                  type="date"
                  value={workItem.endDate}
                  onChange={(e) => onUpdate(index, "endDate", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t("fields.endDate.currentHelp")}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("fields.website.labelShort")}</Label>
              <Input
                value={workItem.url}
                onChange={(e) => onUpdate(index, "url", e.target.value)}
                placeholder={t("fields.workWebsite.placeholder")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("fields.summary.label")}</Label>
              <Textarea
                value={workItem.summary}
                onChange={(e) => onUpdate(index, "summary", e.target.value)}
                placeholder={t("fields.workSummary.placeholder")}
                rows={3}
              />
            </div>

            <HighlightsEditor
              highlights={workItem.highlights}
              onChange={(next) => onUpdate(index, "highlights", next)}
              label={t("fields.keyAchievements.label")}
              addButtonText={t("actions.addAchievement")}
              placeholder={t("fields.achievement.placeholder")}
            />
          </BaseSectionItem>
        )}
      </SortableList>
    </BaseSectionCard>
  );
}
