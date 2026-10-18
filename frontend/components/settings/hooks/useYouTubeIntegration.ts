import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { youtubeService, type YouTubeAccount } from "@/lib/services/youtube-service";
import { beginIntegrationOAuth } from "@/lib/studio/integration-oauth";

/**
 * Per-user YouTube connection — lazy-loaded when the integrations tab is
 * active. The connect/disconnect UI is currently hidden (kept for future
 * use, see IntegrationsSettingsTab), but the account load still runs.
 */
export function useYouTubeIntegration(isAuthenticated: boolean, activeTab: string) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [youtubeAccount, setYoutubeAccount] = useState<YouTubeAccount | null>(null);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeConnecting, setYoutubeConnecting] = useState(false);

  // Lazy-load the YouTube account when the integrations tab is active
  useEffect(() => {
    if (!isAuthenticated || activeTab !== "integrations") return;

    setYoutubeLoading(true);
    youtubeService
      .getAccount()
      .then((response) => {
        setYoutubeAccount(response.data);
      })
      .catch((err) => {
        console.error("Failed to load YouTube account", err);
        setYoutubeAccount(null);
      })
      .finally(() => {
        setYoutubeLoading(false);
      });

  }, [isAuthenticated, activeTab]);

  // YouTube integration handlers (kept for future per-user YouTube connection)
  const handleConnectYouTube = async () => {
    try {
      setYoutubeConnecting(true);
      const response = await youtubeService.getAuthUrl();
      if (response.data?.authUrl) {
        window.location.href = beginIntegrationOAuth("youtube", response.data.authUrl, "/settings");
      } else {
        toast({ title: t("messages.youtubeAuthUrlFailed"), variant: "destructive" });
      }
    } catch (error) {
      console.error("Failed to connect YouTube", error);
      toast({ title: t("messages.youtubeConnectionFailed"), variant: "destructive" });
    } finally {
      setYoutubeConnecting(false);
    }
  };

  const handleDisconnectYouTube = async () => {
    try {
      setYoutubeLoading(true);
      await youtubeService.disconnect();
      setYoutubeAccount(null);
      toast({ title: t("messages.youtubeDisconnected") });
    } catch (error) {
      console.error("Failed to disconnect YouTube", error);
      toast({ title: t("messages.youtubeDisconnectFailed"), variant: "destructive" });
    } finally {
      setYoutubeLoading(false);
    }
  };

  return {
    youtubeAccount,
    youtubeLoading,
    youtubeConnecting,
    handleConnectYouTube,
    handleDisconnectYouTube,
  };
}
