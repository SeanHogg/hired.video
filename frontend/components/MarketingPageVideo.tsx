/**
 * MarketingPageVideo (#1860) — renders the Studio video a SuperAdmin
 * published onto the current route.
 *
 * Mounted once in AppShell. Self-gating per the DRY rule: it resolves the
 * page→video mapping for `location.pathname` and returns `null` when none
 * exists, so it's safe to mount on every page and the consumer never has
 * to decide visibility. No per-page .tsx edits — publishing a video from
 * the Studio "Embed" dialog makes it appear here automatically.
 */

import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import PublicVideoPreview from "@/components/PublicVideoPreview";
import { studioService } from "@/lib/services/studio-service";
import { cn } from "@/lib/utils";

export function MarketingPageVideo(): JSX.Element | null {
  const { pathname } = useLocation();

  const { data } = useQuery({
    queryKey: ["page-embed", pathname],
    queryFn: () => studioService.resolvePageEmbed(pathname),
    // Marketing placements change rarely; keep it cheap across navigation.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const embed = data?.data?.embed ?? null;
  if (!embed) return null;

  const isInline = embed.placement === "inline";

  return (
    <section
      data-page-embed-video
      className={cn(
        "w-full flex justify-center px-4",
        isInline ? "py-4" : "py-6",
      )}
    >
      <div className={cn("w-full", isInline ? "max-w-lg" : "max-w-md")}>
        <PublicVideoPreview
          video={embed.video}
          controls
          className="rounded-xl overflow-hidden shadow-lg ring-1 ring-border"
        />
      </div>
    </section>
  );
}
