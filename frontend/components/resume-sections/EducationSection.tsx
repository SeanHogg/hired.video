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
                value={edu.institution}
                onChange={(e) => onUpdate(index, "institution", e.target.value)}
                placeholder="University of Example"
              />
            </div>
            <div className="space-y-2">
              <Label>Area of Study</Label>
              <Input
                value={edu.area}
                onChange={(e) => onUpdate(index, "area", e.target.value)}
                placeholder="Computer Science"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Study Type</Label>
              <Input
                value={edu.studyType}
                onChange={(e) => onUpdate(index, "studyType", e.target.value)}
                placeholder="Bachelor's Degree"
              />
            </div>
            <div className="space-y-2">
              <Label>Score/GPA</Label>
              <Input
                value={edu.score}
                onChange={(e) => onUpdate(index, "score", e.target.value)}
                placeholder="3.8"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={edu.startDate}
                onChange={(e) => onUpdate(index, "startDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={edu.endDate}
                onChange={(e) => onUpdate(index, "endDate", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Website</Label>
            <Input
              value={edu.url}
              onChange={(e) => onUpdate(index, "url", e.target.value)}
              placeholder="https://university.edu"
            />
          </div>
        </BaseSectionItem>
      ))}
    </BaseSectionCard>
  );
}
