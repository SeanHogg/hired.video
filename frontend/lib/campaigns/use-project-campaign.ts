/**
 * The campaign whose UTMs a studio project's exports carry (#1138): the
 * owner's campaigns, narrowed by `pickProjectCampaign` (the same rule the
 * public player applies to its CTA hot-zones). Null for an unsaved project,
 * a signed-out author or a project in no UTM-bearing campaign.
 */
import { useQuery } from "@tanstack/react-query";
import { useApiReady } from "@/lib/auth";
import { studioService, type VideoCampaign } from "@/lib/services/studio-service";
import { pickProjectCampaign } from "@shared/campaign-utm";

export const studioCampaignsQueryKey = ["studio-campaigns"] as const;

export function useProjectCampaign(projectId: string | null | undefined): VideoCampaign | null {
  const apiReady = useApiReady();
  const enabled = apiReady && !!projectId;
  const query = useQuery({
    queryKey: studioCampaignsQueryKey,
    queryFn: async () => (await studioService.getCampaigns()).data ?? [],
    enabled,
    staleTime: 60_000,
    retry: false,
  });
  if (!enabled || !query.data) return null;
  return pickProjectCampaign(projectId as string, query.data);
}
