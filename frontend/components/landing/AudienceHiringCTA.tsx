/**
 * AudienceHiringCTA — shared geo/hiring call-to-action band for every
 * /for/[audience] landing page (profession + life-stage). Bridges the
 * "build it" surface (studio) to the "use it" surfaces (jobs + profile),
 * reinforcing the platform's region-agnostic, remote-friendly reach.
 *
 * Self-contained per the DRY rule: reads its own copy from i18n and
 * decides its own layout — consumers just mount `<AudienceHiringCTA />`.
 */
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapPin, Briefcase, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AudienceHiringCTA({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <section className={className ?? "px-4 py-16 sm:px-6 lg:px-8 border-t"}>
      <div className="mx-auto max-w-4xl text-center">
        <div className="mb-3 inline-flex items-center gap-2 text-primary">
          <MapPin className="h-6 w-6" />
        </div>
        <h2 className="mb-3 text-3xl font-bold">{t("audienceHiring.heading")}</h2>
        <p className="mx-auto mb-6 max-w-2xl text-lg text-muted-foreground">
          {t("audienceHiring.body")}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/jobs">
              <Briefcase className="mr-2 h-4 w-4" />
              {t("audienceHiring.browseJobs")}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/signup">
              <UserPlus className="mr-2 h-4 w-4" />
              {t("audienceHiring.getDiscovered")}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
