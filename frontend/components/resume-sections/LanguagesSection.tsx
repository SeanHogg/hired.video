import { Globe } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Language } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";

interface LanguagesSectionProps {
  languages: Language[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Language, value: string) => void;
  onRemove: (index: number) => void;
}

export default function LanguagesSection({
  languages,
  onAdd,
  onUpdate,
  onRemove,
}: LanguagesSectionProps) {
  const emptyState = {
    icon: <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: "No languages added yet.",
    description: 'Click "Add Language" to get started.',
  };

  return (
    <BaseSectionCard
      title="Languages"
      onAdd={onAdd}
      addButtonText="Add Language"
      isEmpty={languages.length === 0}
      emptyState={emptyState}
    >
      {languages.map((lang, index) => (
        <BaseSectionItem
          key={index}
          title={`Language ${index + 1}`}
          onRemove={() => onRemove(index)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Language</Label>
              <Input
                value={lang.language}
                onChange={(e) => onUpdate(index, "language", e.target.value)}
                placeholder="English"
              />
            </div>
            <div className="space-y-2">
              <Label>Fluency Level</Label>
              <Select
                value={lang.fluency}
                onValueChange={(value) => onUpdate(index, "fluency", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select fluency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Native">Native</SelectItem>
                  <SelectItem value="Fluent">Fluent</SelectItem>
                  <SelectItem value="Conversational">Conversational</SelectItem>
                  <SelectItem value="Basic">Basic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </BaseSectionItem>
      ))}
    </BaseSectionCard>
  );
}
