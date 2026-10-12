// The ONE reader/writer of the ["video-personalization"] cache entry —
// Settings › Video personalization, the video Design tool and the theme
// picker share it. Signed-out visitors get the defaults (no request).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import {
  DEFAULT_VIDEO_PERSONALIZATION,
  type VideoPersonalization,
} from "@shared/video-personalization";

export const VIDEO_PERSONALIZATION_QUERY_KEY = ["video-personalization"] as const;
const ENDPOINT = "/api/video-personalization";

export function useVideoPersonalization() {
  // isAuthenticated is false for a silent guest session (lib/auth.tsx).
  const { isAuthenticated: signedIn } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: VIDEO_PERSONALIZATION_QUERY_KEY,
    queryFn: async () => (await apiClient.get<VideoPersonalization>(ENDPOINT)).data,
    enabled: signedIn,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const save = useMutation({
    mutationFn: async (next: VideoPersonalization) => (await apiClient.put<VideoPersonalization>(ENDPOINT, next)).data,
    onSuccess: (saved) => qc.setQueryData(VIDEO_PERSONALIZATION_QUERY_KEY, saved),
  });
  return {
    /** Whether this visitor can save (a full account, not a guest). */
    canSave: signedIn,
    personalization: query.data ?? DEFAULT_VIDEO_PERSONALIZATION,
    isLoading: signedIn && query.isLoading,
    save: save.mutateAsync,
    isSaving: save.isPending,
  };
}
