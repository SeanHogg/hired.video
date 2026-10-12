import { useEffect, useRef } from "react";
import { useAdConfig } from "@/lib/hooks/useAdConfig";

export type AdSlotSize =
  | "banner"       // 728×90 — top of page
  | "rectangle"    // 300×250 — sidebar / in-content
  | "leaderboard"  // 970×90 — wide desktop banner
  | "mobile";      // 320×50 — mobile banner

const SIZE_CLASSES: Record<AdSlotSize, string> = {
  banner:      "w-full h-[90px] max-w-[728px]",
  rectangle:   "w-[300px] h-[250px]",
  leaderboard: "w-full h-[90px] max-w-[970px]",
  mobile:      "w-full h-[50px] max-w-[320px]",
};

interface AdSlotProps {
  /**
   * Named slot key matching a key returned by GET /api/ads/config.
   * e.g. "dashboard-banner", "jobs-sidebar", "profile-sidebar"
   * The actual AdSense slot ID is managed server-side — never hardcoded here.
   */
  slot: string;
  size?: AdSlotSize;
  className?: string;
}

/**
 * Renders a Google AdSense unit for free-tier users.
 * Renders nothing (zero DOM nodes) for Pro users.
 *
 * All ad configuration (publisher ID, slot IDs, enabled flag) comes from
 * GET /api/ads/config — the server decides whether to show ads based on the
 * user's subscription. The frontend never makes that decision itself.
 *
 * Usage:
 *   <AdSlot slot="dashboard-banner" size="banner" />
 *   <AdSlot slot="jobs-sidebar" size="rectangle" />
 */
export function AdSlot({ slot, size = "rectangle", className = "" }: AdSlotProps) {
  const { adsEnabled, publisherId, slots, loading } = useAdConfig();
  const ref = useRef<HTMLModElement>(null);
  const slotId = slots[slot] ?? "";

  useEffect(() => {
    if (!adsEnabled || !publisherId || !slotId) return;
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch {
      // AdSense script not yet loaded — silently ignore
    }
  }, [adsEnabled, publisherId, slotId]);

  if (loading || !adsEnabled) return null;

  // Dev placeholder when the API returned adsEnabled but slot IDs aren't set yet
  if (!publisherId || !slotId) {
    if (import.meta.env.DEV) {
      return (
        <div
          className={`${SIZE_CLASSES[size]} ${className} bg-muted/30 border border-dashed border-muted-foreground/20 flex items-center justify-center rounded text-xs text-muted-foreground`}
        >
          Ad slot [{slot}] — configure ADSENSE_PUBLISHER_ID + AD_SLOT_* in wrangler secrets
        </div>
      );
    }
    return null;
  }

  return (
    <div className={`flex justify-center ${className}`}>
      <ins
        ref={ref}
        className={`adsbygoogle block ${SIZE_CLASSES[size]}`}
        data-ad-client={publisherId}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}

export default AdSlot;
