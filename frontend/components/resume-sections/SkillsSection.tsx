import { Award, X } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const emptyState = {
    icon: <Award className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: t("messages.empty.skills.title"),
    description: t("messages.empty.skills.description"),
  };

  const addKeyword = (skillIndex: number) => {
    const updatedKeywords = [...skills[skillIndex].keywords, ""];
    onUpdate(skillIndex, "keywords", updatedKeywords);
  };

  const updateKeyword = (skillIndex: number, keywordIndex: number, value: string) => {
    const updatedKeywords = [...skills[skillIndex].keywords];
    updatedKeywords[keywordIndex] = value;
    onUpdate(skillIndex, "keywords", updatedKeywords);
  };

  const removeKeyword = (skillIndex: number, keywordIndex: number) => {
    const updatedKeywords = skills[skillIndex].keywords.filter((_, i) => i !== keywordIndex);
    onUpdate(skillIndex, "keywords", updatedKeywords);
  };

  return (
    <BaseSectionCard
      title={t("tabs.skills")}
      onAdd={onAdd}
      addButtonText={t("actions.addSkill")}
      isEmpty={skills.length === 0}
      emptyState={emptyState}
    >
      {skills.map((skill, index) => (
        <BaseSectionItem
          key={index}
          title={t("labels.itemNumber.skill", { index: index + 1 })}
          onRemove={() => onRemove(index)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("fields.skillName.label")}</Label>
              <Input
                value={skill.name}
                onChange={(e) => onUpdate(index, "name", e.target.value)}
                placeholder={t("fields.skillName.placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("fields.proficiencyLevel.label")}</Label>
              <Select
                value={skill.level}
                onValueChange={(value) => onUpdate(index, "level", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("fields.proficiencyLevel.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Beginner">{t("labels.skillLevel.beginner")}</SelectItem>
                  <SelectItem value="Intermediate">{t("labels.skillLevel.intermediate")}</SelectItem>
                  <SelectItem value="Advanced">{t("labels.skillLevel.advanced")}</SelectItem>
                  <SelectItem value="Expert">{t("labels.skillLevel.expert")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("fields.relatedKeywords.label")}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addKeyword(index)}
              >
                {t("actions.addKeyword")}
              </Button>
            </div>
            <div className="space-y-2">
              {skill.keywords.map((keyword, keywordIndex) => (
                <div key={keywordIndex} className="flex gap-2">
                  <Input
                    value={keyword}
                    onChange={(e) => updateKeyword(index, keywordIndex, e.target.value)}
                    placeholder={t("fields.relatedKeywords.placeholder")}
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
