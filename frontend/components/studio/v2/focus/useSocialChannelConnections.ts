/**
 * useSocialChannelConnections — the Post dock's view of the user's own
 * TikTok / Instagram / X / Facebook / LinkedIn accounts: which networks the server
 * offers, which are connected, and how to connect one. State comes from the
 * shared entitlement query (useSocialPublishEntitlement); connecting runs the
 * server-side OAuth (/api/social) in a new tab that returns to the shared
 * integration callback page, whose broadcast re-reads the state here.
 */
import { useCallback } from "react";
import { useSocialPublishEntitlement } from "@/lib/hooks/useSocialPublishEntitlement";
import { socialService } from "@/lib/services/social-service";
import { integrationCallbackUrl, useIntegrationOAuthLinked } from "@/lib/studio/integration-oauth";
import { SOCIAL_POST_PLATFORMS, type SocialPostPlatform } from "@shared/social-platforms";

export function useSocialChannelConnections(open: boolean) {
  const { offers, forPlatform, refetch } = useSocialPublishEntitlement();
  const reload = useCallback(() => void refetch(), [refetch]);
  useIntegrationOAuthLinked(SOCIAL_POST_PLATFORMS, reload, open);

  const connect = async (platform: SocialPostPlatform): Promise<void> => {
    // Open the tab inside the click so popup blockers allow it.
    const tab = window.open("", "_blank");
    try {
      const url = await socialService.getAuthUrl(platform, integrationCallbackUrl(platform));
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      throw err;
    }
  };

  return {
    offers,
    isConnected: (platform: SocialPostPlatform): boolean => !!forPlatform(platform)?.selfAvailable,
    connect,
    reload,
  };
}
