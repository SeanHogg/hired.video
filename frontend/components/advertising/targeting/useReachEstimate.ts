/**
 * Live audience reach for the targeting inspector (#1769/#1770).
 *
 * The local `estimateAudienceBucket()` answers instantly on every tweak;
 * the server count (same SQL predicate the ad renders with, cached per
 * spec hash) follows once the spec has been stable for a moment.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { estimateAudienceBucket, type AdSetTargeting } from "@shared/ad-targeting";
import { advertisingService } from "@/lib/services/advertising-service";

const DEBOUNCE_MS = 400;

export function useReachEstimate(targeting: AdSetTargeting) {
  const local = useMemo(() => estimateAudienceBucket(targeting), [targeting]);
  const serialized = useMemo(() => JSON.stringify(targeting), [targeting]);
  const [settled, setSettled] = useState(serialized);

  useEffect(() => {
    const id = window.setTimeout(() => setSettled(serialized), DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [serialized]);

  const query = useQuery({
    queryKey: ["advertising", "reach", settled],
    queryFn: () => advertisingService.estimateReach(JSON.parse(settled) as AdSetTargeting),
    staleTime: 60_000,
    retry: false,
  });

  return {
    bucket: query.data?.bucket ?? local.bucket,
    reach: query.data?.reach ?? null,
    loading: query.isFetching,
  };
}
