// The ONE reader of the ["studio","public-videos"] cache entry — the home
// page's "Just posted" hero stack and its video wall share one request.

import { useQuery } from "@tanstack/react-query";
import { studioService, type PublicVideo } from "@/lib/services/studio-service";

export const PUBLIC_VIDEO_FEED_QUERY_KEY = ["studio", "public-videos"] as const;

/** Recent public videos, newest first; `[]` while loading or on failure
 *  (each surface falls back to its own empty state). */
export function usePublicVideoFeed(): { videos: readonly PublicVideo[]; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: PUBLIC_VIDEO_FEED_QUERY_KEY,
    queryFn: async () => (await studioService.getPublicVideos()).data ?? [],
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { videos: data ?? [], isLoading };
}
