/**
 * #2396 — First-party ad unit. Fetches one creative from
 * GET /api/advertising/serve?slot=… and renders title, description,
 * image, and CTA. Renders nothing when the slot is empty.
 */

import { useQuery } from "@tanstack/react-query";
import { advertisingService } from "@/lib/services/advertising-service";

export interface InternalAdSlotProps {
  slot: string;
  className?: string;
}

export function InternalAdSlot({ slot, className = "" }: InternalAdSlotProps) {
  const q = useQuery({
    queryKey: ["advertising", "serve", slot],
    queryFn: () => advertisingService.getServedAd(slot),
    staleTime: 60_000,
  });

  const ad = q.data;
  if (!ad) return null;

  const href = ad.ctaUrl || ad.destinationUrl;
  return (
    <aside
      className={`rounded-lg border bg-card overflow-hidden ${className}`}
      data-slot={slot}
      aria-label={ad.headline}
    >
      {ad.imageUrl && (
        <img src={ad.imageUrl} alt="" className="w-full h-auto max-h-40 object-cover" />
      )}
      <div className="p-3 space-y-1">
        <p className="text-sm font-medium">{ad.headline}</p>
        {ad.description && (
          <p className="text-xs text-muted-foreground">{ad.description}</p>
        )}
        {href && (
          <a
            href={href}
            className="inline-block mt-1 text-xs font-medium text-primary hover:underline"
          >
            {ad.ctaText}
          </a>
        )}
      </div>
    </aside>
  );
}

export default InternalAdSlot;
