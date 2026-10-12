/**
 * Off-platform reach data source for ArtifactAnalyticsDashboard (#2048):
 * which artifact kinds have posts on other networks, and how to read them.
 * A Studio video's analytics id is its project id, and the counts the
 * networks reported for its posts come from /api/distribution (snapshots
 * ingested by webhooks and the half-hourly sync). Every other kind has none.
 */
import type { ArtifactKind } from "@shared/artifact-views";
import { distributionService, type OffPlatformReach } from "@/lib/services/distribution-service";

export type OffPlatformReachSource = (artifactId: string) => Promise<OffPlatformReach>;

export function offPlatformReachSourceFor(kind: ArtifactKind): OffPlatformReachSource | null {
  return kind === "video" ? (id) => distributionService.reach(id) : null;
}
