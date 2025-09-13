import { BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Publication } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";

interface PublicationsSectionProps {
  publications: Publication[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Publication, value: string) => void;
  onRemove: (index: number) => void;
}

export default function PublicationsSection({
  publications,
  onAdd,
  onUpdate,
  onRemove,
}: PublicationsSectionProps) {
  const emptyState = {
    icon: <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: "No publications added yet.",
    description: 'Click "Add Publication" to get started.',
  };

  return (
    <BaseSectionCard
      title="Publications"
      onAdd={onAdd}
      addButtonText="Add Publication"
      isEmpty={publications.length === 0}
      emptyState={emptyState}
    >
      {publications.map((pub, index) => (
        <BaseSectionItem
          key={index}
          title={`Publication ${index + 1}`}
          onRemove={() => onRemove(index)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Publication Name</Label>
              <Input
                value={pub.Name}
                onChange={(e) => onUpdate(index, "Name", e.target.value)}
                placeholder="Research Paper Title"
              />
            </div>
            <div className="space-y-2">
              <Label>Publisher</Label>
              <Input
                value={pub.Publisher}
                onChange={(e) => onUpdate(index, "Publisher", e.target.value)}
                placeholder="IEEE, ACM, etc."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Release Date</Label>
              <Input
                type="date"
                value={pub.ReleaseDate}
                onChange={(e) => onUpdate(index, "ReleaseDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Publication URL</Label>
              <Input
                value={pub.Url}
                onChange={(e) => onUpdate(index, "Url", e.target.value)}
                placeholder="https://doi.org/10.1000/xyz123"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Summary</Label>
            <Textarea
              value={pub.Summary}
              onChange={(e) => onUpdate(index, "Summary", e.target.value)}
              placeholder="Brief summary of the publication..."
              rows={3}
            />
          </div>
        </BaseSectionItem>
      ))}
    </BaseSectionCard>
  );
}
