import { Briefcase , X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Work } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";

interface WorkExperienceSectionProps {
  work: Work[];
  sortedWork?: Work[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Work, value: string | string[]) => void;
  onRemove: (index: number) => void;
  onAddHighlight: (workIndex: number) => void;
  onUpdateHighlight: (workIndex: number, highlightIndex: number, value: string) => void;
  onRemoveHighlight: (workIndex: number, highlightIndex: number) => void;
}

export default function WorkExperienceSection({
  work,
  sortedWork,
  onAdd,
  onUpdate,
  onRemove,
  onAddHighlight,
  onUpdateHighlight,
  onRemoveHighlight,
}: WorkExperienceSectionProps) {
  const { t } = useTranslation();
  // Always compute stable, correct sort for edit panels:
  // - Current roles first: EndDate null/empty (also handle 'present'/'current'/'now')
  // - Then by most recent end date desc; for current roles, start date desc
  const isCurrent = (end?: string) => {
    const s = (end || '').trim().toLowerCase();
    return s === '' || s === 'present' || s === 'current' || s === 'now';
  };
  const toTime = (val?: string): number | null => {
    if (!val) return null;
    const ts = Date.parse(val);
    return Number.isFinite(ts) ? ts : null;
  };
  const compareWork = (a: Work, b: Work) => {
    const aCur = isCurrent(a.endDate);
    const bCur = isCurrent(b.endDate);
    if (aCur && !bCur) return -1;
    if (!aCur && bCur) return 1;
    if (aCur && bCur) {
      const aStart = toTime(a.startDate);
      const bStart = toTime(b.startDate);
      if (aStart !== null && bStart !== null) return bStart - aStart;
      // Treat a missing start date as "just added" so a freshly-created
      // empty entry lands at the top instead of being buried under existing
      // current roles.
      if (aStart === null && bStart === null) return 0;
      if (aStart === null) return -1;
      return 1;
    }
    // both not current
    const aEnd = toTime(a.endDate) ?? toTime(a.startDate);
    const bEnd = toTime(b.endDate) ?? toTime(b.startDate);
    if (aEnd !== null && bEnd !== null) return bEnd - aEnd;
    if (aEnd !== null) return -1;
    if (bEnd !== null) return 1;
    return 0;
  };
  const source = (sortedWork && sortedWork.length ? sortedWork : work);
  const displayWork = source.slice().sort(compareWork);
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
      {displayWork.map((workItem, displayIndex) => {
        // Find the original index in the unsorted array for proper updates
        const originalIndex = work.findIndex(item =>
          item.name === workItem.name &&
          item.position === workItem.position &&
          item.startDate === workItem.startDate
        );

        return (
          <BaseSectionItem
            key={originalIndex}
            title={t("labels.itemNumber.work", { index: displayIndex + 1 })}
            onRemove={() => onRemove(originalIndex)}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("fields.company.label")}</Label>
                <Input
                  value={workItem.name}
                  onChange={(e) => onUpdate(originalIndex, "name", e.target.value)}
                  placeholder={t("fields.company.placeholder")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("fields.position.label")}</Label>
                <Input
                  value={workItem.position}
                  onChange={(e) => onUpdate(originalIndex, "position", e.target.value)}
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
                  onChange={(e) => onUpdate(originalIndex, "startDate", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("fields.endDate.label")}</Label>
                <Input
                  type="date"
                  value={workItem.endDate}
                  onChange={(e) => onUpdate(originalIndex, "endDate", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t("fields.endDate.currentHelp")}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("fields.website.labelShort")}</Label>
              <Input
                value={workItem.url}
                onChange={(e) => onUpdate(originalIndex, "url", e.target.value)}
                placeholder={t("fields.workWebsite.placeholder")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("fields.summary.label")}</Label>
              <Textarea
                value={workItem.summary}
                onChange={(e) => onUpdate(originalIndex, "summary", e.target.value)}
                placeholder={t("fields.workSummary.placeholder")}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("fields.keyAchievements.label")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onAddHighlight(originalIndex)}
                >
                  {t("actions.addAchievement")}
                </Button>
              </div>
              <div className="space-y-2">
                {workItem.highlights.map((highlight, highlightIndex) => (
                  <div key={highlightIndex} className="flex gap-2">
                    <Input
                      value={highlight}
                      onChange={(e) =>
                        onUpdateHighlight(originalIndex, highlightIndex, e.target.value)
                      }
                      placeholder={t("fields.achievement.placeholder")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveHighlight(originalIndex, highlightIndex)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </BaseSectionItem>
        );
      })}
    </BaseSectionCard>
  );
}
