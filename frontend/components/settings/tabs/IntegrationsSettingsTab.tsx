import { useTranslation } from "react-i18next";
import { CheckCircle, Share2, Youtube } from "lucide-react";
import VendorIntegrationsCard from "@/components/settings/VendorIntegrationsCard";
import { SocialConnectionsList } from "@/components/social/SocialConnectionsList";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Integrations tab. The per-user YouTube connection card is hidden (kept
 * for future use); its state + connect/disconnect handlers live in
 * `useYouTubeIntegration` (components/settings/hooks) — when it returns,
 * render it here from that hook's values (loading spinner → connected
 * state with a destructive "Disconnect" button, or the connect pitch with
 * a "Connect YouTube Account" button).
 */
export function IntegrationsSettingsTab() {
  const { t } = useTranslation();
  return (
    <>
      {/* Generic self-serve API-key vendor registry (#261). Admin
          only — the card self-hides (returns null) on a 403. */}
      <VendorIntegrationsCard />

      {/* Social publishing connections (PRD §5.0, Lane B). The
          connectable platforms render inline here via the shared
          <SocialConnectionsList> (same surface as
          /settings/connections) so members can connect an account
          without clicking through. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            {t("headings.socialPublishing")}
          </CardTitle>
          <CardDescription>
            {t("messages.socialPublishingDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SocialConnectionsList />
        </CardContent>
      </Card>

      {/* Regular users: Video hosting info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-red-600" />
            {t("headings.videoStorage")}
          </CardTitle>
          <CardDescription>
            {t("messages.videoStorageDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-brand-green/10 rounded-xl border border-brand-green/30">
            <CheckCircle className="h-6 w-6 text-brand-green-text" />
            <div className="flex-1">
              <h4 className="font-medium text-foreground">{t("headings.videoHostingActive")}</h4>
              <p className="text-sm text-brand-green-text">
                {t("messages.videoHostingActiveDesc")}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium">{t("headings.howItWorks")}</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>{t("messages.videoHostingStep1")}</li>
              <li>{t("messages.videoHostingStep2")}</li>
              <li>{t("messages.videoHostingStep3")}</li>
              <li>{t("messages.videoHostingStep4")}</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
