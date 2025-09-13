import { GraduationCap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Education } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";

interface EducationSectionProps {
  education: Education[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Education, value: string | string[] | null) => void;
  onRemove: (index: number) => void;
}

export default function EducationSection({
  education,
  onAdd,
  onUpdate,
  onRemove,
}: EducationSectionProps) {
  const emptyState = {
    icon: <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: "No education added yet.",
    description: 'Click "Add Education" to get started.',
  };

  return (
    <BaseSectionCard
      title="Education"
      onAdd={onAdd}
      addButtonText="Add Education"
      isEmpty={education.length === 0}
      emptyState={emptyState}
    >
      {education.map((edu, index) => (
        <BaseSectionItem
          key={index}
          title={`Education ${index + 1}`}
          onRemove={() => onRemove(index)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Institution</Label>
              <Input
                value={edu.Institution}
                onChange={(e) => onUpdate(index, "Institution", e.target.value)}
                placeholder="University of Example"
              />
            </div>
            <div className="space-y-2">
              <Label>Area of Study</Label>
              <Input
                value={edu.Area}
                onChange={(e) => onUpdate(index, "Area", e.target.value)}
                placeholder="Computer Science"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Study Type</Label>
              <Input
                value={edu.StudyType}
                onChange={(e) => onUpdate(index, "StudyType", e.target.value)}
                placeholder="Bachelor's Degree"
              />
            </div>
            <div className="space-y-2">
              <Label>Score/GPA</Label>
              <Input
                value={edu.Score}
                onChange={(e) => onUpdate(index, "Score", e.target.value)}
                placeholder="3.8"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={edu.StartDate}
                onChange={(e) => onUpdate(index, "StartDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={edu.EndDate}
                onChange={(e) => onUpdate(index, "EndDate", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Website</Label>
            <Input
              value={edu.Url}
              onChange={(e) => onUpdate(index, "Url", e.target.value)}
              placeholder="https://university.edu"
            />
          </div>
        </BaseSectionItem>
      ))}
    </BaseSectionCard>
  );
}
