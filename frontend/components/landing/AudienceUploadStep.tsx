/**
 * AudienceUploadStep — where every /for/:audience page ends (#2364): the
 * upload step of that audience's Upload → Create → Promote loop, decided by
 * its create intent (lib/studio/create-intent.ts).
 *
 *   resume  → the kit drop zone itself (photo · résumé · letter · job), the
 *             same one the home hero renders; dropping opens /studio/new
 *   video   → into the studio seeded with the audience's own template, where
 *             the footage goes in
 *   job     → the job-post create page (upload or paste the description)
 *   company → the company-page create page
 *
 * `useIntentCta` gives the hero and the closing band the same primary link,
 * so a page never points two buttons at two different starts.
 */
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import KitDropZone from "@/components/workspace/kit/KitDropZone";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { createIntentHref, type CreateIntent } from "@/lib/studio/create-intent";
import type { HeroLink } from "./SeoHero";

interface IntentOptions {
  /** Seeds a video start with this catalog template (the audience's first). */
  videoTemplate?: string;
}

/** The primary "start" link for an intent — hero + closing band share it. */
export function useIntentCta(intent: CreateIntent, opts: IntentOptions = {}): HeroLink {
  const { t } = useTranslation();
  return { to: createIntentHref(intent, opts), label: t(`audienceLanding.upload.${intent}.cta`) };
}

interface AudienceUploadStepProps extends IntentOptions {
  intent: CreateIntent;
  /** Unique per page — the band's aria-labelledby id. */
  id: string;
  tone?: "page" | "card";
}

export function AudienceUploadStep({ intent, id, tone = "card", videoTemplate }: AudienceUploadStepProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cta = useIntentCta(intent, { videoTemplate });
  const headingId = `${id}-upload-title`;

  return (
    <MarketingBand tone={tone} labelledBy={headingId} className="flex flex-col gap-8">
      <MarketingSectionIntro
        id={headingId}
        title={t(`audienceLanding.upload.${intent}.heading`)}
        subtitle={t(`audienceLanding.upload.${intent}.body`)}
      />
      {intent === "resume" ? (
        <div className="flex max-w-[640px] flex-col gap-3">
          <KitDropZone lead="resume" onStart={(state) => navigate(NEW_KIT_PATH, { state })} />
          <p className="text-center text-[13px] text-muted-foreground">{t("landing.hero.finePrint")}</p>
        </div>
      ) : (
        <div>
          <Button asChild size="lg">
            <Link to={cta.to}>
              {cta.label}
              <ArrowRight className="ml-1 h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}
    </MarketingBand>
  );
}
