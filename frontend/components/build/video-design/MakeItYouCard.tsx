import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAuthGate } from "@/components/auth/useAuthGate";
import { useVideoPersonalization } from "@/hooks/use-video-personalization";
import { hasPersonalization } from "@shared/video-personalization";

const SETTINGS_PATH = "/settings?tab=video-personalization";

/**
 * "Make it more you" (Angle board): a guest is invited to a free account to
 * add their own words, interests and moments once; a signed-in person sees
 * what their videos already use, with a link to edit it in Settings.
 */
export function MakeItYouCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { canSave, personalization } = useVideoPersonalization();
  const { requireAuth, gate } = useAuthGate({ redirectTo: SETTINGS_PATH });

  if (!canSave) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3">
        <p className="text-sm font-semibold text-foreground">{t("videoDesign.makeItYou.title")}</p>
        <p className="text-xs text-muted-foreground">{t("videoDesign.makeItYou.body")}</p>
        <Button
          size="sm"
          className="self-start"
          onClick={() => requireAuth({ reason: t("videoDesign.makeItYou.reason"), onAuthed: () => navigate(SETTINGS_PATH) }) && navigate(SETTINGS_PATH)}
        >
          {t("videoDesign.makeItYou.cta")}
        </Button>
        {gate}
      </div>
    );
  }

  const parts = [
    personalization.ownWords ? t("videoDesign.using.ownWords") : "",
    personalization.interests.length ? t("videoDesign.using.interests", { count: personalization.interests.length }) : "",
    personalization.birthday || personalization.wedding || personalization.inMemory || personalization.isParent ? t("videoDesign.using.moments") : "",
  ].filter(Boolean);

  return (
    <p className="text-xs text-muted-foreground">
      {hasPersonalization(personalization) ? t("videoDesign.using.summary", { list: parts.join(", ") }) : t("videoDesign.using.none")}{" "}
      <Link to={SETTINGS_PATH} className="font-medium text-primary hover:underline">
        {t("videoDesign.using.edit")}
      </Link>
    </p>
  );
}
