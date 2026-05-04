import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { SortableList } from "./SortableList";

interface LanguagesSectionProps {
  languages: Language[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof Language, value: string) => void;
  onRemove: (index: number) => void;
  onReorder?: (next: Language[]) => void;
}

export default function LanguagesSection({
  languages,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
}: LanguagesSectionProps) {
  const { t } = useTranslation();
  const emptyState = {
    icon: <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />,
    title: t("messages.empty.languages.title"),
    description: t("messages.empty.languages.description"),
  };

  return (
    <BaseSectionCard
      title={t("tabs.languages")}
      onAdd={onAdd}
      addButtonText={t("actions.addLanguage")}
      isEmpty={languages.length === 0}
      emptyState={emptyState}
    >
      <SortableList
        items={languages}
        getId={(l, i) => l.id ?? `language-idx-${i}`}
        onReorder={onReorder}
      >
        {(lang, index) => (
        <BaseSectionItem
          key={lang.id ?? `language-idx-${index}`}
          id={lang.id}
          collapsedSummary={
            lang.language || lang.fluency
              ? `${lang.language || ""}${lang.fluency ? ` · ${lang.fluency}` : ""}`.trim()
              : undefined
          }
          title={t("labels.itemNumber.language", { index: index + 1 })}
          onRemove={() => onRemove(index)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("fields.language.label")}</Label>
              <Input
                value={lang.language}
                onChange={(e) => onUpdate(index, "language", e.target.value)}
                placeholder={t("fields.language.placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("fields.fluencyLevel.label")}</Label>
              <Select
                value={lang.fluency}
                onValueChange={(value) => onUpdate(index, "fluency", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("fields.fluencyLevel.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Native">{t("labels.fluency.native")}</SelectItem>
                  <SelectItem value="Fluent">{t("labels.fluency.fluent")}</SelectItem>
                  <SelectItem value="Conversational">{t("labels.fluency.conversational")}</SelectItem>
                  <SelectItem value="Basic">{t("labels.fluency.basic")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </BaseSectionItem>
        )}
      </SortableList>
    </BaseSectionCard>
  );
}
