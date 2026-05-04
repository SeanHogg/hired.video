import { BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Publication, SkillEvidence } from "@/types/resume";
import { mergePublications } from "@shared/skill-evidence";
import { useSectionMerge } from "@/components/useSectionMerge";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";
import { SortableList } from "./SortableList";

interface PublicationsSectionProps {
  publications: Publication[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Publication, value: string) => void;
  onRemove: (index: number) => void;
  onReorder?: (next: Publication[]) => void;
  evidence?: SkillEvidence[];
  onReplacePublicationsAndEvidence?: (next: Publication[], nextEvidence: SkillEvidence[]) => void;
}

export default function PublicationsSection({
  publications,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
  evidence,
  onReplacePublicationsAndEvidence,
}: PublicationsSectionProps) {
  const merge = useSectionMerge<Publication>({
    items: publications,
    noun: "publication",
    onReplace: onReplacePublicationsAndEvidence,
    mergeFn: ({ selectedIndexes, primaryIndex }) => {
      if (!onReplacePublicationsAndEvidence) return;
      const result = mergePublications({
        publications,
        evidence: evidence ?? [],
        selectedIndexes,
        primaryIndex,
      });
      onReplacePublicationsAndEvidence(result.publications, result.evidence);
    },
    renderLabel: (p) => (
      <span>
        <strong>{p.name || "(unnamed)"}</strong>
        {p.publisher ? ` · ${p.publisher}` : ""}
      </span>
    ),
  });
  const { t } = useTranslation();
  const emptyState = {
    icon: <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: t("messages.empty.publications.title"),
    description: t("messages.empty.publications.description"),
  };

  return (
    <BaseSectionCard
      title={t("tabs.publications")}
      onAdd={onAdd}
      addButtonText={t("actions.addPublication")}
      isEmpty={publications.length === 0}
      emptyState={emptyState}
    >
      {merge.bar}
      {merge.tip}
      <SortableList
        items={publications}
        getId={(p, i) => p.id ?? `publication-idx-${i}`}
        onReorder={onReorder}
      >
        {(pub, index) => (
        <BaseSectionItem
          key={pub.id ?? `publication-idx-${index}`}
          id={pub.id}
          collapsedSummary={
            pub.name || pub.publisher
              ? `${pub.name || ""}${pub.publisher ? ` · ${pub.publisher}` : ""}`.trim()
              : undefined
          }
          title={
            <span className="inline-flex items-center gap-2">
              {merge.checkbox(index)}
              {t("labels.itemNumber.publication", { index: index + 1 })}
            </span>
          }
          onRemove={() => onRemove(index)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("fields.publicationName.label")}</Label>
              <Input
                value={pub.name}
                onChange={(e) => onUpdate(index, "name", e.target.value)}
                placeholder={t("fields.publicationName.placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("fields.publisher.label")}</Label>
              <Input
                value={pub.publisher}
                onChange={(e) => onUpdate(index, "publisher", e.target.value)}
                placeholder={t("fields.publisher.placeholder")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("fields.releaseDate.label")}</Label>
              <Input
                type="date"
                value={pub.releaseDate}
                onChange={(e) => onUpdate(index, "releaseDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("fields.publicationUrl.label")}</Label>
              <Input
                value={pub.url}
                onChange={(e) => onUpdate(index, "url", e.target.value)}
                placeholder={t("fields.publicationUrl.placeholder")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("fields.summary.label")}</Label>
            <Textarea
              value={pub.summary}
              onChange={(e) => onUpdate(index, "summary", e.target.value)}
              placeholder={t("fields.publicationSummary.placeholder")}
              rows={3}
            />
          </div>
        </BaseSectionItem>
        )}
      </SortableList>
    </BaseSectionCard>
  );
}
