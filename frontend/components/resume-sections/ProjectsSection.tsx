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
    const updatedKeywords = [...projects[projectIndex].Keywords, ""];
    onUpdate(projectIndex, "Keywords", updatedKeywords);
  };

  const updateKeyword = (projectIndex: number, keywordIndex: number, value: string) => {
    const updatedKeywords = [...projects[projectIndex].Keywords];
    updatedKeywords[keywordIndex] = value;
    onUpdate(projectIndex, "Keywords", updatedKeywords);
  };

  const removeKeyword = (projectIndex: number, keywordIndex: number) => {
    const updatedKeywords = projects[projectIndex].Keywords.filter((_, i) => i !== keywordIndex);
    onUpdate(projectIndex, "Keywords", updatedKeywords);
  };

  const addHighlight = (projectIndex: number) => {
    const updatedHighlights = [...projects[projectIndex].Highlights, ""];
    onUpdate(projectIndex, "Highlights", updatedHighlights);
  };

  const updateHighlight = (projectIndex: number, highlightIndex: number, value: string) => {
    const updatedHighlights = [...projects[projectIndex].Highlights];
    updatedHighlights[highlightIndex] = value;
    onUpdate(projectIndex, "Highlights", updatedHighlights);
  };

  const removeHighlight = (projectIndex: number, highlightIndex: number) => {
    const updatedHighlights = projects[projectIndex].Highlights.filter((_, i) => i !== highlightIndex);
    onUpdate(projectIndex, "Highlights", updatedHighlights);
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
                value={project.Name}
                onChange={(e) => onUpdate(index, "Name", e.target.value)}
                placeholder="My Awesome Project"
              />
            </div>
            <div className="space-y-2">
              <Label>Entity/Organization</Label>
              <Input
                value={project.Entity}
                onChange={(e) => onUpdate(index, "Entity", e.target.value)}
                placeholder="Personal Project"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={project.StartDate}
                onChange={(e) => onUpdate(index, "StartDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={project.EndDate}
                onChange={(e) => onUpdate(index, "EndDate", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Project URL</Label>
            <Input
              value={project.Url}
              onChange={(e) => onUpdate(index, "Url", e.target.value)}
              placeholder="https://github.com/username/project"
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={project.Description}
              onChange={(e) => onUpdate(index, "Description", e.target.value)}
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
              {project.Highlights.map((highlight, highlightIndex) => (
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
              {project.Keywords.map((keyword, keywordIndex) => (
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
