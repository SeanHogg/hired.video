/**
 * useDistributionJobs — one Hub list (upcoming / sent / failed) and the two
 * actions on a job (cancel, retry). The upcoming list re-reads every minute
 * while open, so a post the queue just sent moves along on its own.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { distributionService } from "@/lib/services/distribution-service";
import type { PublishJobView } from "@shared/social-publish-jobs";

export const distributionJobsKey = ["distribution", "jobs"] as const;

export function useDistributionJobs(view: PublishJobView) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: [...distributionJobsKey, view],
    queryFn: () => distributionService.list(view),
    refetchInterval: view === "upcoming" ? 60_000 : false,
  });
  const refreshAll = () => void qc.invalidateQueries({ queryKey: distributionJobsKey });
  const cancel = useMutation({ mutationFn: (jobId: string) => distributionService.cancel(jobId), onSettled: refreshAll });
  const retry = useMutation({ mutationFn: (jobId: string) => distributionService.retry(jobId), onSettled: refreshAll });
  return { query, cancel, retry, refreshAll };
}
