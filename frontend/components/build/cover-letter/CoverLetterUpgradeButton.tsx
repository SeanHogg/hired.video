/**
 * "Upgrade to write it" — the in-place Pro prompt for the cover letter.
 * Owns its gate (useProGate): a free account sees the Pro offer; once the
 * plan turns Pro the waiting letter is written automatically by
 * useCoverLetterWriter, so there is nothing else to click.
 */
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProGate } from "@/components/billing/useProGate";

export default function CoverLetterUpgradeButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const { t } = useTranslation();
  const { requirePro, gate } = useProGate();
  return (
    <>
      <Button type="button" size={size} className="min-h-11 gap-1.5 sm:min-h-9" onClick={() => requirePro(t("build.letter.proReason"))}>
        <Sparkles aria-hidden="true" className="h-4 w-4" />
        {t("build.letter.upgrade")}
      </Button>
      {gate}
    </>
  );
}
