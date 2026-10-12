// StudioMarketingHeader — the marketing hero band shown ABOVE the studio
// workspace for signed-out visitors at /studio (the "red region"). The
// signed-out studio surface now renders the SAME workspace a signed-in user
// sees (templates carousel + "My content"), topped with this band; the only
// difference between the two audiences is this header + the fact that an
// anonymous visitor has nothing saved yet. Extracted from the legacy
// `StudioLayout` `Landing()` so the hero lives in one reusable place; it
// reuses the existing `studioLayout.*` i18n keys (no new strings).
//
// StudioLanding mounts this only when `!user`, so signed-in users never see
// it.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import HeroVideoSpotlight from "@/components/HeroVideoSpotlight";
import { HeroEyebrow } from "@/components/landing/SeoHero";
import { AudienceQuickLinks } from "@/components/studio/templates/AudienceQuickLinks";
import { studioService, type PublicVideo } from "@/lib/services/studio-service";

export default function StudioMarketingHeader() {
  const { t } = useTranslation();
  // Mirror the / homepage spotlight — same SA-curated featured set so
  // unauthenticated visitors see the same showcase on both surfaces.
  const [publicVideos, setPublicVideos] = useState<PublicVideo[]>([]);
  useEffect(() => {
    studioService
      .getFeaturedVideos()
      .then((res) => setPublicVideos(res.data ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="mb-8">
      <div className="mb-10 grid grid-cols-1 items-center gap-10 pt-4 lg:grid-cols-5 lg:gap-12">
        <div className="flex flex-col gap-[22px] lg:col-span-3">
          <HeroEyebrow>{t("labels.studioLayout.creatorStudio")}</HeroEyebrow>
          <h1 className="font-display text-[clamp(42px,5.6vw,72px)] font-bold leading-[0.98] tracking-[-0.035em] text-foreground">
            {t("headings.studioLayout.heroTitle")}
          </h1>
          <p className="max-w-[32em] text-lg leading-relaxed text-muted-foreground">
            {t("messages.studioLayout.heroSubtitle")}
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {/* Anon adoption (#2212): drop visitors straight into the editor
                on a fresh video-resume draft, no account required. Save /
                Publish / Export prompt for sign-up in place (and keep their
                work) via the Studio conversion gate. */}
            <Button asChild size="lg">
              <Link to="/studio/new?contentTemplate=resume">
                {t("actions.studioLayout.startCreating")}
                <ArrowRight className="ml-1 h-[18px] w-[18px]" aria-hidden="true" />
              </Link>
            </Button>
            <Link to="/login" className="inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline">
              {t("actions.signIn")}
            </Link>
          </div>
        </div>

        <div className="lg:col-span-2">
          <HeroVideoSpotlight videos={publicVideos} />
        </div>
      </div>

      {/* Browse-by-audience discovery — reads `AUDIENCES` directly (#900) so
          adding an audience lights it up here automatically. Marketing-only:
          StudioLanding mounts this whole header only for signed-out visitors. */}
      <AudienceQuickLinks />
    </div>
  );
}
