/**
 * ToolShowcase — grid of the 3-5 features that matter most for an
 * audience. Reads from the audience registry's `focusFeatures` array —
 * no per-page definitions.
 */
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import type { AudienceFocusFeature } from "@shared/audiences-registry";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { featureLabel, featureBlurb } from "./localize-audience";
import { HeroEyebrow } from "./SeoHero";
import { LinkTile } from "./LinkTile";

export interface ToolShowcaseProps {
  features: AudienceFocusFeature[];
  /** Optional eyebrow text rendered above the section header. */
  eyebrow?: string;
  tone?: "page" | "card";
}

/** Renders the focus features grid. Self-gates: returns null when the
 *  caller has zero features to surface. */
export function ToolShowcase({ features, eyebrow, tone = "card" }: ToolShowcaseProps): JSX.Element | null {
  const { t } = useTranslation();
  if (features.length === 0) return null;
  return (
    <MarketingBand tone={tone} labelledBy="tool-showcase-title" className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        {eyebrow ? <HeroEyebrow>{eyebrow}</HeroEyebrow> : null}
        <MarketingSectionIntro
          id="tool-showcase-title"
          title={t("audiences.toolShowcase.heading", { defaultValue: "Tools made for this moment" })}
        />
      </div>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5">
        {features.map((f) => (
          <li key={f.key}>
            <LinkTile
              to={f.href}
              title={featureLabel(t, f)}
              body={featureBlurb(t, f)}
              footer={
                <>
                  {t("audiences.toolShowcase.cta", { defaultValue: "Try it" })}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              }
            />
          </li>
        ))}
      </ul>
    </MarketingBand>
  );
}
