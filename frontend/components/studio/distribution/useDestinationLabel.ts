/**
 * Display name for a scheduled post's destination (#2047): the network's
 * name (the Post dock's own naming, publish-destination-meta), "hired.video
 * feed" for the native cross-post, and "via hired.video" when it goes out
 * on hired.video's brand account (Lane A).
 */
import { useTranslation } from "react-i18next";
import { destinationLabel } from "@/lib/studio/publish-destination-meta";
import { FEED_DESTINATION, type DistributionLane } from "@shared/social-publish-jobs";

export function useDestinationLabel() {
  const { t } = useTranslation();
  return (destination: string, lane: DistributionLane | string = "self"): string => {
    if (destination === FEED_DESTINATION) return t("distribution.destination.feed");
    const name = destinationLabel(destination);
    return lane === "managed" ? t("distribution.destination.viaHired", { name }) : name;
  };
}
