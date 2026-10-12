/**
 * Display name for a Post-dock channel — shared by the channel cards and
 * the posted list so both name a channel the same way.
 */
import { useTranslation } from "react-i18next";
import { destinationLabel } from "@/lib/studio/publish-destination-meta";
import type { ShareChannelId } from "@/lib/studio/share-channels";

export function useShareChannelLabel() {
  const { t } = useTranslation();
  return (channel: ShareChannelId): string =>
    channel === "profile" ? t("studio.share.channel.profile") : destinationLabel(channel);
}
