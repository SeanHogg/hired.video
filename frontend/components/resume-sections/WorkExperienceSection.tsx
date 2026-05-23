import { Briefcase } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Work, SkillEvidence } from "@/types/resume";
import { mergeWork } from "@shared/skill-evidence";
import { useSectionMerge } from "@/components/useSectionMerge";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";
import HighlightsEditor from "./HighlightsEditor";
import { SortableList } from "./SortableList";
import XyzTextWand from "./XyzTextWand";

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
  /** Skill evidence — needed by the merge function to remap evidence
   *  rows when work items get fused. Optional; when omitted the merge
   *  UI doesn't render. */
  evidence?: SkillEvidence[];
  onReplaceWorkAndEvidence?: (nextWork: Work[], nextEvidence: SkillEvidence[]) => void;
}

export default function WorkExperienceSection({
  work,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
  evidence,
  onReplaceWorkAndEvidence,
}: WorkExperienceSectionProps) {
  const { t } = useTranslation();
  const emptyState = {
    icon: <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: t("messages.empty.work.title"),
    description: t("messages.empty.work.description"),
  };

  const merge = useSectionMerge<Work>({
    items: work,
    noun: "work entry",
    nounPlural: "work entries",
    onReplace: onReplaceWorkAndEvidence,
    mergeFn: ({ selectedIndexes, primaryIndex }) => {
      if (!onReplaceWorkAndEvidence) return;
      const result = mergeWork({
        work,
        evidence: evidence ?? [],
        selectedIndexes,
        primaryIndex,
      });
      onReplaceWorkAndEvidence(result.work, result.evidence);
    },
    renderLabel: (w) => (
      <span>
        <strong>{w.position || "(no position)"}</strong>
        {w.name ? ` · ${w.name}` : ""}
        {w.startDate || w.endDate
          ? ` — ${w.startDate || "?"} – ${w.endDate || "Present"}`
          : ""}
      </span>
    ),
    tipText:
      "Tip: tick two or more work entries to merge duplicates (e.g. the same role split across two rows by a date gap).",
  });

  return (
    <BaseSectionCard
      title={t("headings.workExperience")}
      onAdd={onAdd}
      addButtonText={t("actions.addWorkExperience")}
      isEmpty={work.length === 0}
      emptyState={emptyState}
    >
      {merge.bar}
      {merge.tip}
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
            title={
              <span className="inline-flex items-center gap-2">
                {merge.checkbox(index)}
                {t("labels.itemNumber.work", { index: index + 1 })}
              </span>
            }
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
                <div className="flex items-center justify-between">
                  <Label>{t("fields.position.label")}</Label>
                  <XyzTextWand
                    kind="position"
                    value={workItem.position}
                    onChange={(next) => onUpdate(index, "position", next)}
                    context={{ organization: workItem.name }}
                  />
                </div>
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
              <div className="flex items-center justify-between">
                <Label>{t("fields.summary.label")}</Label>
                <XyzTextWand
                  kind="summary"
                  value={workItem.summary}
                  onChange={(next) => onUpdate(index, "summary", next)}
                  context={{
                    role: workItem.position,
                    organization: workItem.name,
                    highlights: workItem.highlights,
                  }}
                />
              </div>
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
              aiContext={{
                role: workItem.position,
                organization: workItem.name,
                summary: workItem.summary,
              }}
            />
          </BaseSectionItem>
        )}
      </SortableList>
    </BaseSectionCard>
  );
}
