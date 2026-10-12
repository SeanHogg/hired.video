// Full-width "Extract skills" submit button shared by the Saved / Paste /
// Upload tabs of the Skill Extractor input card.

import { Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface ExtractSkillsButtonProps {
  onClick: () => void;
  disabled: boolean;
  isExtracting: boolean;
}

export function ExtractSkillsButton({ onClick, disabled, isExtracting }: ExtractSkillsButtonProps) {
  const { t } = useTranslation();
  return (
    <Button onClick={onClick} disabled={disabled} size="lg" className="w-full">
      {isExtracting ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
          {t("skillExtractor.extracting")}
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4 mr-2" aria-hidden="true" />
          {t("tools.card.skill-extractor.cta")}
        </>
      )}
    </Button>
  );
}
