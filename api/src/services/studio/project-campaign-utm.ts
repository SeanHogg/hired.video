/**
 * The campaign UTMs a studio project's public CTA hot-zones carry (#1138).
 * One indexed join (video_campaign_projects.project_id → video_campaigns),
 * then the shared `pickProjectCampaign` rule — the same rule the editor's
 * export render applies — so the player and the export never disagree.
 *
 * Not cached on its own: it runs inside the public watch payload
 * (GET /api/studio/public/:videoId), which is served through
 * `getPublicWatchCached`. Campaign membership / UTM edits bump that
 * cache so the next public view picks up the new tags.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { pickProjectCampaign, type CampaignUtm } from "../../../../shared/campaign-utm.js";

const { videoCampaigns, videoCampaignProjects } = schema;

export async function findProjectCampaignUtm(projectId: string): Promise<CampaignUtm | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: videoCampaigns.id,
      status: videoCampaigns.status,
      utmSource: videoCampaigns.utmSource,
      utmMedium: videoCampaigns.utmMedium,
      utmCampaign: videoCampaigns.utmCampaign,
      updatedAt: videoCampaigns.updatedAt,
    })
    .from(videoCampaignProjects)
    .innerJoin(videoCampaigns, eq(videoCampaigns.id, videoCampaignProjects.campaignId))
    .where(eq(videoCampaignProjects.projectId, projectId))
    .limit(50);
  const picked = pickProjectCampaign(
    projectId,
    rows.map((r) => ({ ...r, projectIds: [projectId], updatedAt: r.updatedAt.toISOString() })),
  );
  return picked
    ? { utmSource: picked.utmSource, utmMedium: picked.utmMedium, utmCampaign: picked.utmCampaign }
    : null;
}
