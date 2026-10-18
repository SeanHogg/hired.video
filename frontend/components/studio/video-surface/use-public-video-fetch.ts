import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api-client";
import {
  PublicVideoSchema,
  isReady,
  type PublicVideoReady,
} from "@/lib/studio/public-video-schema";

/** Fetches + validates the `/api/studio/public/:id` payload for the lazy
 *  surface. Returns the ready payload (or null while in flight) and an
 *  error flag when the fetch / parse fails or the project isn't ready. */
export function usePublicVideoFetch(videoId: string): {
  ready: PublicVideoReady | null;
  error: boolean;
} {
  const [ready, setReady] = useState<PublicVideoReady | null>(null);
  const [error, setError] = useState(false);

  // Eager fetch on mount. No press-play gate — every consumer wants
  // the canvas first frame visible the moment the surface mounts, and
  // the editor's preview overlay + the /v/:id watch page + the
  // homepage carousel all behave that way. A separate gated mode just
  // diverged the UX (#755 user report: "the video on /resume is black
  // because it never fetched").
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get(`/api/studio/public/${videoId}`)
      .then((res: any) => {
        if (cancelled) return;
        const raw = res?.data ?? res;
        const parsed = PublicVideoSchema.safeParse(raw);
        if (parsed.success && isReady(parsed.data)) {
          setReady(parsed.data);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  return { ready, error };
}
