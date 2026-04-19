import { Trophy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Award as AwardType } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";

interface AwardsSectionProps {
  awards: AwardType[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof AwardType, value: string) => void;
  onRemove: (index: number) => void;
}

export default function AwardsSection({
  awards,
  onAdd,
  onUpdate,
  onRemove,
}: AwardsSectionProps) {
  const emptyState = {
    icon: <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: "No awards added yet.",
    description: 'Click "Add Award" to get started.',
  };

  return (
    <BaseSectionCard
      title="Awards"
      onAdd={onAdd}
      addButtonText="Add Award"
      isEmpty={awards.length === 0}
      emptyState={emptyState}
    >
      {awards.map((award, index) => (
        <BaseSectionItem
          key={index}
          title={`Award ${index + 1}`}
          onRemove={() => onRemove(index)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Award Title</Label>
              <Input
                value={award.title}
                onChange={(e) => onUpdate(index, "title", e.target.value)}
                placeholder="Employee of the Year"
              />
            </div>
            <div className="space-y-2">
              <Label>Awarder</Label>
              <Input
                value={award.awarder}
                onChange={(e) => onUpdate(index, "awarder", e.target.value)}
                placeholder="Acme Corporation"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={award.date}
              onChange={(e) => onUpdate(index, "date", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Summary</Label>
            <Textarea
              value={award.summary}
              onChange={(e) => onUpdate(index, "summary", e.target.value)}
              placeholder="Describe the award and why you received it..."
              rows={3}
            />
          </div>
        </BaseSectionItem>
      ))}
    </BaseSectionCard>
  );
}
