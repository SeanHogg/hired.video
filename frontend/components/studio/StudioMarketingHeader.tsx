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
import { ArrowRight, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import HeroVideoSpotlight from "@/components/HeroVideoSpotlight";
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
      <div className="mb-10 grid grid-cols-1 items-center gap-8 lg:grid-cols-5 lg:gap-10">
        <div className="text-center lg:col-span-3 lg:text-left">
          <div className="mb-6 inline-flex items-center space-x-2">
            <div className="relative">
              <Sparkles className="h-12 w-12 text-primary" />
              <Star className="absolute -right-1 -top-1 h-6 w-6 text-brand-blue" />
            </div>
            <span className="bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-4xl font-bold text-transparent">
              {t("labels.studioLayout.creatorStudio")}
            </span>
          </div>
          <h1 className="mb-6 text-4xl font-bold lg:text-5xl">
            {t("headings.studioLayout.heroTitle")}
          </h1>
          <p className="mb-8 text-lg text-muted-foreground lg:text-xl">
            {t("messages.studioLayout.heroSubtitle")}
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row lg:justify-start">
            {/* Anon adoption (#2212): drop visitors straight into the editor
                on a fresh video-resume draft — no account required. Save /
                Publish / Export prompt for sign-up in place (and keep their
                work) via the Studio conversion gate. */}
            <Link to="/studio/new?contentTemplate=resume">
              <Button
                size="lg"
                className="bg-gradient-to-r from-brand-purple to-brand-blue px-8 text-lg hover:opacity-90"
              >
                {t("actions.studioLayout.startCreating")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="px-8 text-lg">
                {t("actions.signIn")}
              </Button>
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
