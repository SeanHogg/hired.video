/**
 * AudienceProofRow — the hero proof on a /for/:audience page (#2346
 * persuasion layer), in the order the audience registry lists it. REAL
 * numbers only:
 *
 *   templates → how many catalog templates are made for this audience
 *               (counted from TEMPLATE_CATALOG; hidden at zero)
 *   builders  → the live site-wide résumé count (ProofFigure self-hides
 *               below its display floor, so a thin number never shows)
 */
import { useTranslation } from "react-i18next";
import { LayoutTemplate } from "lucide-react";
import type { AudienceProof } from "@/lib/studio/templates/audiences";
import { ProofFigure } from "@/components/marketing/persuasion/ProofFigure";

interface AudienceProofRowProps {
  proof: readonly AudienceProof[];
  templateCount: number;
  /** The audience's localized plural label, lower-cased for the sentence. */
  labelLower: string;
}

export function AudienceProofRow({ proof, templateCount, labelLower }: AudienceProofRowProps) {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      {proof.map((kind) => {
        if (kind === "builders") return <ProofFigure key={kind} />;
        if (templateCount === 0) return null;
        return (
          <p key={kind} className="flex items-center gap-2 text-[15px] text-muted-foreground">
            <LayoutTemplate className="h-4 w-4 flex-none text-primary" aria-hidden="true" />
            <span>
              {t("audienceLanding.proof.templates", {
                count: templateCount,
                figure: templateCount.toLocaleString(i18n.language),
                label: labelLower,
              })}
            </span>
          </p>
        );
      })}
    </div>
  );
}
