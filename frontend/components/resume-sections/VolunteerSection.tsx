import { Heart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Volunteer } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";

interface VolunteerSectionProps {
  volunteer: Volunteer[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Volunteer, value: string | string[] | null) => void;
  onRemove: (index: number) => void;
}

export default function VolunteerSection({
  volunteer,
  onAdd,
  onUpdate,
  onRemove,
}: VolunteerSectionProps) {
  const emptyState = {
    icon: <Heart className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: "No volunteer experience added yet.",
    description: 'Click "Add Volunteer Experience" to get started.',
  };

  return (
    <BaseSectionCard
      title="Volunteer Experience"
      onAdd={onAdd}
      addButtonText="Add Volunteer Experience"
      isEmpty={volunteer.length === 0}
      emptyState={emptyState}
    >
      {volunteer.map((vol, index) => (
        <BaseSectionItem
          key={index}
          title={`Volunteer Experience ${index + 1}`}
          onRemove={() => onRemove(index)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Organization</Label>
              <Input
                value={vol.organization}
                onChange={(e) => onUpdate(index, "organization", e.target.value)}
                placeholder="Red Cross"
              />
            </div>
            <div className="space-y-2">
              <Label>Position</Label>
              <Input
                value={vol.position}
                onChange={(e) => onUpdate(index, "position", e.target.value)}
                placeholder="Volunteer Coordinator"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={vol.startDate}
                onChange={(e) => onUpdate(index, "startDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={vol.endDate}
                onChange={(e) => onUpdate(index, "endDate", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Website</Label>
            <Input
              value={vol.url}
              onChange={(e) => onUpdate(index, "url", e.target.value)}
              placeholder="https://redcross.org"
            />
          </div>

          <div className="space-y-2">
            <Label>Summary</Label>
            <Textarea
              value={vol.summary}
              onChange={(e) => onUpdate(index, "summary", e.target.value)}
              placeholder="Describe your volunteer work..."
              rows={3}
            />
          </div>
        </BaseSectionItem>
      ))}
    </BaseSectionCard>
  );
}
