import { UserCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Reference } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";

interface ReferencesSectionProps {
  references: Reference[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Reference, value: string) => void;
  onRemove: (index: number) => void;
}

export default function ReferencesSection({
  references,
  onAdd,
  onUpdate,
  onRemove,
}: ReferencesSectionProps) {
  const emptyState = {
    icon: <UserCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: "No references added yet.",
    description: 'Click "Add Reference" to get started.',
  };

  return (
    <BaseSectionCard
      title="References"
      onAdd={onAdd}
      addButtonText="Add Reference"
      isEmpty={references.length === 0}
      emptyState={emptyState}
    >
      {references.map((ref, index) => (
        <BaseSectionItem
          key={index}
          title={`Reference ${index + 1}`}
          onRemove={() => onRemove(index)}
        >
          <div className="space-y-2">
            <Label>Reference Name</Label>
            <Input
              value={ref.Name}
              onChange={(e) => onUpdate(index, "Name", e.target.value)}
              placeholder="John Smith"
            />
          </div>

          <div className="space-y-2">
            <Label>Reference Details</Label>
            <Textarea
              value={ref.Reference}
              onChange={(e) => onUpdate(index, "Reference", e.target.value)}
              placeholder="Include contact information, relationship, and any relevant details..."
              rows={4}
            />
          </div>
        </BaseSectionItem>
      ))}
    </BaseSectionCard>
  );
}
