import { FolderOpen, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Project } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";

interface ProjectsSectionProps {
  projects: Project[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Project, value: string | string[]) => void;
  onRemove: (index: number) => void;
}

export default function ProjectsSection({
  projects,
  onAdd,
  onUpdate,
  onRemove,
}: ProjectsSectionProps) {
  const emptyState = {
    icon: <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: "No projects added yet.",
    description: 'Click "Add Project" to get started.',
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

  const addHighlight = (projectIndex: number) => {
    const updatedHighlights = [...projects[projectIndex].highlights, ""];
    onUpdate(projectIndex, "highlights", updatedHighlights);
  };

  const updateHighlight = (projectIndex: number, highlightIndex: number, value: string) => {
    const updatedHighlights = [...projects[projectIndex].highlights];
    updatedHighlights[highlightIndex] = value;
    onUpdate(projectIndex, "highlights", updatedHighlights);
  };

  const removeHighlight = (projectIndex: number, highlightIndex: number) => {
    const updatedHighlights = projects[projectIndex].highlights.filter((_, i) => i !== highlightIndex);
    onUpdate(projectIndex, "highlights", updatedHighlights);
  };

  return (
    <BaseSectionCard
      title="Projects"
      onAdd={onAdd}
      addButtonText="Add Project"
      isEmpty={projects.length === 0}
      emptyState={emptyState}
    >
      {projects.map((project, index) => (
        <BaseSectionItem
          key={index}
          title={`Project ${index + 1}`}
          onRemove={() => onRemove(index)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Project Name</Label>
              <Input
                value={project.name}
                onChange={(e) => onUpdate(index, "name", e.target.value)}
                placeholder="My Awesome Project"
              />
            </div>
            <div className="space-y-2">
              <Label>Entity/Organization</Label>
              <Input
                value={project.entity}
                onChange={(e) => onUpdate(index, "entity", e.target.value)}
                placeholder="Personal Project"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={project.startDate}
                onChange={(e) => onUpdate(index, "startDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={project.endDate}
                onChange={(e) => onUpdate(index, "endDate", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Project URL</Label>
            <Input
              value={project.url}
              onChange={(e) => onUpdate(index, "url", e.target.value)}
              placeholder="https://github.com/username/project"
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={project.description}
              onChange={(e) => onUpdate(index, "description", e.target.value)}
              placeholder="Describe your project..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Key Highlights</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addHighlight(index)}
              >
                Add Highlight
              </Button>
            </div>
            <div className="space-y-2">
              {project.highlights.map((highlight, highlightIndex) => (
                <div key={highlightIndex} className="flex gap-2">
                  <Input
                    value={highlight}
                    onChange={(e) => updateHighlight(index, highlightIndex, e.target.value)}
                    placeholder="Describe a key highlight..."
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeHighlight(index, highlightIndex)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Technologies/Keywords</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addKeyword(index)}
              >
                Add Keyword
              </Button>
            </div>
            <div className="space-y-2">
              {project.keywords.map((keyword, keywordIndex) => (
                <div key={keywordIndex} className="flex gap-2">
                  <Input
                    value={keyword}
                    onChange={(e) => updateKeyword(index, keywordIndex, e.target.value)}
                    placeholder="React, TypeScript, etc."
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
      ))}
    </BaseSectionCard>
  );
}
