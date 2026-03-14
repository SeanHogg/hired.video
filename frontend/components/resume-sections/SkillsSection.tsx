import { Award, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Skill } from "@/types/resume";
import BaseSectionCard from "./BaseSectionCard";
import BaseSectionItem from "./BaseSectionItem";

interface SkillsSectionProps {
  skills: Skill[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Skill, value: string | string[]) => void;
  onRemove: (index: number) => void;
}

export default function SkillsSection({
  skills,
  onAdd,
  onUpdate,
  onRemove,
}: SkillsSectionProps) {
  const emptyState = {
    icon: <Award className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: "No skills added yet.",
    description: 'Click "Add Skill" to get started.',
  };

  const addKeyword = (skillIndex: number) => {
    const updatedKeywords = [...skills[skillIndex].Keywords, ""];
    onUpdate(skillIndex, "Keywords", updatedKeywords);
  };

  const updateKeyword = (skillIndex: number, keywordIndex: number, value: string) => {
    const updatedKeywords = [...skills[skillIndex].Keywords];
    updatedKeywords[keywordIndex] = value;
    onUpdate(skillIndex, "Keywords", updatedKeywords);
  };

  const removeKeyword = (skillIndex: number, keywordIndex: number) => {
    const updatedKeywords = skills[skillIndex].Keywords.filter((_, i) => i !== keywordIndex);
    onUpdate(skillIndex, "Keywords", updatedKeywords);
  };

  return (
    <BaseSectionCard
      title="Skills"
      onAdd={onAdd}
      addButtonText="Add Skill"
      isEmpty={skills.length === 0}
      emptyState={emptyState}
    >
      {skills.map((skill, index) => (
        <BaseSectionItem
          key={index}
          title={`Skill ${index + 1}`}
          onRemove={() => onRemove(index)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Skill Name</Label>
              <Input
                value={skill.Name}
                onChange={(e) => onUpdate(index, "Name", e.target.value)}
                placeholder="JavaScript"
              />
            </div>
            <div className="space-y-2">
              <Label>Proficiency Level</Label>
              <Select
                value={skill.Level}
                onValueChange={(value) => onUpdate(index, "Level", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Beginner">Beginner</SelectItem>
                  <SelectItem value="Intermediate">Intermediate</SelectItem>
                  <SelectItem value="Advanced">Advanced</SelectItem>
                  <SelectItem value="Expert">Expert</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
              {skill.Keywords.map((keyword, keywordIndex) => (
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
