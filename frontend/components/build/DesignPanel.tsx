/**
 * Design tab of the kit panel: the résumé's structure and template. The
 * template row always includes the one currently applied (templateChoices).
 * An existing résumé shows its saved design until a pick here replaces it,
 * and the panel says so (a legacy studio layout gets its own note, since
 * picking replaces that layout).
 */
import { useTranslation } from "react-i18next";
import type { ResumeStructure } from "@shared/resume-insights";
import { templateChoices } from "@/lib/build/use-resume-insights";
import type { Resume } from "@/types/resume";
import StructurePicker from "./StructurePicker";
import TemplateSuggestions from "./TemplateSuggestions";

interface DesignPanelProps {
  structure: ResumeStructure | null;
  recommended: ResumeStructure;
  onStructureChange: (structure: ResumeStructure) => void;
  suggestedTemplates: readonly string[];
  templateId: string;
  onTemplateChange: (slug: string) => void;
  resume: Resume;
  usingSavedDesign: boolean;
  hasStudioLayout: boolean;
}

export default function DesignPanel({
  structure,
  recommended,
  onStructureChange,
  suggestedTemplates,
  templateId,
  onTemplateChange,
  resume,
  usingSavedDesign,
  hasStudioLayout,
}: DesignPanelProps) {
  const { t } = useTranslation();
  return (
    <>
      {usingSavedDesign && (
        <p className="rounded-xl border border-border bg-muted/50 px-3.5 py-3 text-[13px] text-muted-foreground">
          {hasStudioLayout ? t("build.design.savedLayoutNote") : t("build.design.savedNote")}
        </p>
      )}
      <StructurePicker value={structure} recommended={recommended} onChange={onStructureChange} />
      <TemplateSuggestions
        slugs={templateChoices(suggestedTemplates, templateId)}
        selected={templateId}
        onSelect={onTemplateChange}
        resume={resume}
      />
    </>
  );
}
