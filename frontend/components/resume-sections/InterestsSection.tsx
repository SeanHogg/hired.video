import { Lightbulb, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Interest } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";

interface InterestsSectionProps {
  interests: Interest[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Interest, value: string | string[]) => void;
  onRemove: (index: number) => void;
}

export default function InterestsSection({
  interests,
  onAdd,
  onUpdate,
  onRemove,
}: InterestsSectionProps) {
  const emptyState = {
    icon: <Lightbulb className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: "No interests added yet.",
    description: 'Click "Add Interest" to get started.',
  };

  const addKeyword = (interestIndex: number) => {
    const updatedKeywords = [...interests[interestIndex].keywords, ""];
    onUpdate(interestIndex, "keywords", updatedKeywords);
  };

  const updateKeyword = (interestIndex: number, keywordIndex: number, value: string) => {
    const updatedKeywords = [...interests[interestIndex].keywords];
    updatedKeywords[keywordIndex] = value;
    onUpdate(interestIndex, "keywords", updatedKeywords);
  };

  const removeKeyword = (interestIndex: number, keywordIndex: number) => {
    const updatedKeywords = interests[interestIndex].keywords.filter((_, i) => i !== keywordIndex);
    onUpdate(interestIndex, "keywords", updatedKeywords);
  };

  return (
    <BaseSectionCard
      title="Interests"
      onAdd={onAdd}
      addButtonText="Add Interest"
      isEmpty={interests.length === 0}
      emptyState={emptyState}
    >
      {interests.map((interest, index) => (
        <BaseSectionItem
          key={index}
          title={`Interest ${index + 1}`}
          onRemove={() => onRemove(index)}
        >
          <div className="space-y-2">
            <Label>Interest Name</Label>
            <Input
              value={interest.name}
              onChange={(e) => onUpdate(index, "name", e.target.value)}
              placeholder="Photography, Hiking, etc."
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Related Keywords</Label>
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
              {interest.keywords.map((keyword, keywordIndex) => (
                <div key={keywordIndex} className="flex gap-2">
                  <Input
                    value={keyword}
                    onChange={(e) => updateKeyword(index, keywordIndex, e.target.value)}
                    placeholder="Related keyword..."
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
