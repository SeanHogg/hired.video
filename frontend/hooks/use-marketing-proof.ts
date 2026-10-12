// The ONE reader of the ["marketing","proof"] cache entry — every marketing
// surface that shows a proof figure shares a single request per session.

import { useQuery } from "@tanstack/react-query";
import { marketingProofService } from "@/lib/services/marketing-proof-service";
import { roundProofFigure } from "@shared/marketing-proof";

export const MARKETING_PROOF_QUERY_KEY = ["marketing", "proof"] as const;

/** Rounded-down count of real people who built a resume, or null when it
 *  is still loading, failed, or sits below the display floor. */
export function useResumeBuilderFigure(): number | null {
  const { data } = useQuery({
    queryKey: MARKETING_PROOF_QUERY_KEY,
    queryFn: () => marketingProofService.getStats(),
    staleTime: 60 * 60_000,
    retry: false,
  });
  return data ? roundProofFigure(data.resumeBuilders) : null;
}
