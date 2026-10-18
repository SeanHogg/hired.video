import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { integrationOAuthErrorKey } from "@/lib/studio/integration-oauth";
import { initialSettingsTab, remapLegacyTab } from "@/components/settings/settings-tabs";

/**
 * Active /settings tab, seeded from the URL (`?tab=`, `?billing_setup=1`)
 * and driven by the YouTube OAuth callback params.
 */
export function useSettingsActiveTab() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => initialSettingsTab(window.location.search));

  // Sync active tab from ?tab= query param (e.g. /settings?tab=lead-generation)
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setActiveTab(remapLegacyTab(tab));
    // run once on mount; subsequent tab changes are user-driven
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle YouTube OAuth callback query params
  useEffect(() => {
    const youtubeSuccess = searchParams.get("youtube_success");
    const youtubeError = searchParams.get("youtube_error");

    if (youtubeSuccess === "true") {
      toast({ title: t("messages.youtubeConnected") });
      setActiveTab("integrations");
      searchParams.delete("youtube_success");
      setSearchParams(searchParams, { replace: true });
    } else if (youtubeError) {
      toast({
        title: t("messages.youtubeConnectFailed"),
        description: t(integrationOAuthErrorKey(youtubeError)),
        variant: "destructive"
      });
      setActiveTab("integrations");
      searchParams.delete("youtube_error");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, toast, t]);

  return { activeTab, setActiveTab, searchParams, setSearchParams };
}
