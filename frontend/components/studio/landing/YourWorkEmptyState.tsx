import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NEW_KIT_PATH } from "@/lib/build-entry";

/**
 * "Your work" empty state — three variants: signed-out (sign-up prompt),
 * nothing made yet, and nothing matching the filter / search.
 */
export default function YourWorkEmptyState({
  signedIn,
  totalWorkCount,
}: {
  signedIn: boolean;
  totalWorkCount: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-border bg-card px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary">
        <Video className="h-6 w-6" aria-hidden="true" />
      </span>
      <div>
        {!signedIn ? (
          // Signed-out: nothing is saved until they have an account.
          // Anything they start from a template opens in the anon editor,
          // where Save/Publish/Export prompt for sign-up in place.
          <>
            <p className="text-sm font-medium">{t("messages.studioLanding.anonMyContentTitle")}</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              {t("messages.studioLanding.anonMyContentHint")}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button asChild size="sm">
                <Link to="/signup">{t("actions.createAccount")}</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/login">{t("actions.signIn")}</Link>
              </Button>
            </div>
          </>
        ) : totalWorkCount === 0 ? (
          <>
            <p className="text-sm font-medium">{t("messages.studioLanding.noProjectsYet")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("messages.studioLanding.noProjectsYetHint")}</p>
            <Button asChild size="sm" className="mt-4">
              <Link to={NEW_KIT_PATH}>{t("landing.cta.buildMyResume")}</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">{t("studio.landing.work.noMatches")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("messages.studioLanding.noFilteredProjectsHint")}</p>
          </>
        )}
      </div>
    </div>
  );
}
