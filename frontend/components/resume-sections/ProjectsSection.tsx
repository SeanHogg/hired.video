import { FolderOpen, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Project, SkillEvidence } from "@/types/resume";
import { mergeProjects } from "@shared/skill-evidence";
import { useSectionMerge } from "@/components/useSectionMerge";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";
import HighlightsEditor from "./HighlightsEditor";
import { SortableList } from "./SortableList";
import XyzTextWand from "./XyzTextWand";

interface ProjectsSectionProps {
  projects: Project[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Project, value: string | string[]) => void;
  onRemove: (index: number) => void;
  onReorder?: (next: Project[]) => void;
  evidence?: SkillEvidence[];
  onReplaceProjectsAndEvidence?: (next: Project[], nextEvidence: SkillEvidence[]) => void;
}

export default function ProjectsSection({
  projects,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
  evidence,
  onReplaceProjectsAndEvidence,
}: ProjectsSectionProps) {
  const merge = useSectionMerge<Project>({
    items: projects,
    noun: "project",
    onReplace: onReplaceProjectsAndEvidence,
    mergeFn: ({ selectedIndexes, primaryIndex }) => {
      if (!onReplaceProjectsAndEvidence) return;
      const result = mergeProjects({
        projects,
        evidence: evidence ?? [],
        selectedIndexes,
        primaryIndex,
      });
      onReplaceProjectsAndEvidence(result.projects, result.evidence);
    },
    renderLabel: (p) => (
      <span>
        <strong>{p.name || "(unnamed)"}</strong>
        {p.entity ? ` · ${p.entity}` : ""}
      </span>
    ),
  });
  const { t } = useTranslation();
  const emptyState = {
    icon: <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: t("messages.empty.projects.title"),
    description: t("messages.empty.projects.description"),
  };

  const addKeyword = (projectIndex: number) => {
    const updatedKeywords = [...projects[projectIndex].keywords, ""];
    onUpdate(projectIndex, "keywords", updatedKeywords);
  };

  const updateKeyword = (projectIndex: number, keywordIndex: number, value: string) => {
    const updatedKeywords = [...projects[projectIndex].keywords];
    updatedKeywords[keywordIndex] = value;
    onUpdate(projectIndex, "keywords", updatedKeywords);
  };

  const removeKeyword = (projectIndex: number, keywordIndex: number) => {
    const updatedKeywords = projects[projectIndex].keywords.filter((_, i) => i !== keywordIndex);
    onUpdate(projectIndex, "keywords", updatedKeywords);
  };

  return (
    <BaseSectionCard
      title={t("tabs.projects")}
      onAdd={onAdd}
      addButtonText={t("actions.addProject")}
      isEmpty={projects.length === 0}
      emptyState={emptyState}
    >
      {merge.bar}
      {merge.tip}
      <SortableList
        items={projects}
        getId={(p, i) => p.id ?? `project-idx-${i}`}
        onReorder={onReorder}
      >
        {(project, index) => (
        <BaseSectionItem
          key={project.id ?? `project-idx-${index}`}
          id={project.id}
          collapsedSummary={
            project.name || project.entity
              ? `${project.name || ""}${project.entity ? ` · ${project.entity}` : ""}`.trim()
              : undefined
          }
          title={
            <span className="inline-flex items-center gap-2">
              {merge.checkbox(index)}
              {t("labels.itemNumber.project", { index: index + 1 })}
            </span>
          }
          onRemove={() => onRemove(index)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("fields.projectName.label")}</Label>
              <Input
                value={project.name}
                onChange={(e) => onUpdate(index, "name", e.target.value)}
                placeholder={t("fields.projectName.placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("fields.entity.label")}</Label>
              <Input
                value={project.entity}
                onChange={(e) => onUpdate(index, "entity", e.target.value)}
                placeholder={t("fields.entity.placeholder")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("fields.startDate.label")}</Label>
              <Input
                type="date"
                value={project.startDate}
                onChange={(e) => onUpdate(index, "startDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("fields.endDate.label")}</Label>
              <Input
                type="date"
                value={project.endDate}
                onChange={(e) => onUpdate(index, "endDate", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("fields.projectUrl.label")}</Label>
            <Input
              value={project.url}
              onChange={(e) => onUpdate(index, "url", e.target.value)}
              placeholder={t("fields.projectUrl.placeholder")}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("fields.description.label")}</Label>
              <XyzTextWand
                kind="summary"
                value={project.description}
                onChange={(next) => onUpdate(index, "description", next)}
                context={{
                  role: project.name,
                  organization: project.entity,
                  highlights: project.highlights,
                }}
                fieldLabel="description"
              />
            </div>
            <Textarea
              value={project.description}
              onChange={(e) => onUpdate(index, "description", e.target.value)}
              placeholder={t("fields.description.placeholder")}
              rows={3}
            />
          </div>

          <HighlightsEditor
            highlights={project.highlights}
            onChange={(next) => onUpdate(index, "highlights", next)}
            label={t("fields.keyHighlights.label")}
            addButtonText={t("actions.addHighlight")}
            placeholder={t("fields.highlight.placeholder")}
            aiContext={{
              role: project.name,
              organization: project.entity,
              summary: project.description,
            }}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("fields.technologies.label")}</Label>
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
              {project.keywords.map((keyword, keywordIndex) => (
                <div key={keywordIndex} className="flex gap-2">
                  <Input
                    value={keyword}
                    onChange={(e) => updateKeyword(index, keywordIndex, e.target.value)}
                    placeholder={t("fields.relatedKeywords.placeholder")}
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
