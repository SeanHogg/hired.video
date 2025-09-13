import { Briefcase } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { WorkExperience } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";

interface WorkExperienceSectionProps {
  work: WorkExperience[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof WorkExperience, value: string | string[]) => void;
  onRemove: (index: number) => void;
  onAddHighlight: (workIndex: number) => void;
  onUpdateHighlight: (workIndex: number, highlightIndex: number, value: string) => void;
  onRemoveHighlight: (workIndex: number, highlightIndex: number) => void;
}

export default function WorkExperienceSection({
  work,
  onAdd,
  onUpdate,
  onRemove,
  onAddHighlight,
  onUpdateHighlight,
  onRemoveHighlight,
}: WorkExperienceSectionProps) {
  const emptyState = {
    icon: <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: "No work experience added yet.",
    description: 'Click "Add Work Experience" to get started.',
  };

  return (
    <BaseSectionCard
      title="Work Experience"
      onAdd={onAdd}
      addButtonText="Add Work Experience"
      isEmpty={work.length === 0}
      emptyState={emptyState}
    >
      {work.map((workItem, index) => (
        <BaseSectionItem
          key={index}
          title={`Work Experience ${index + 1}`}
          onRemove={() => onRemove(index)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Company</Label>
              <Input
                value={workItem.Name}
                onChange={(e) => onUpdate(index, "Name", e.target.value)}
                placeholder="Acme Corp"
              />
            </div>
            <div className="space-y-2">
              <Label>Position</Label>
              <Input
                value={workItem.Position}
                onChange={(e) => onUpdate(index, "Position", e.target.value)}
                placeholder="Software Engineer"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={workItem.StartDate}
                onChange={(e) => onUpdate(index, "StartDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={workItem.EndDate}
                onChange={(e) => onUpdate(index, "EndDate", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Website</Label>
            <Input
              value={workItem.Url}
              onChange={(e) => onUpdate(index, "Url", e.target.value)}
              placeholder="https://acmecorp.com"
            />
          </div>

          <div className="space-y-2">
            <Label>Summary</Label>
            <Textarea
              value={workItem.Summary}
              onChange={(e) => onUpdate(index, "Summary", e.target.value)}
              placeholder="Describe your role and responsibilities..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Key Achievements</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAddHighlight(index)}
              >
                Add Achievement
              </Button>
            </div>
            <div className="space-y-2">
              {workItem.Highlights.map((highlight, highlightIndex) => (
                <div key={highlightIndex} className="flex gap-2">
                  <Input
                    value={highlight}
                    onChange={(e) =>
                      onUpdateHighlight(index, highlightIndex, e.target.value)
                    }
                    placeholder="Describe a key achievement..."
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveHighlight(index, highlightIndex)}
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
