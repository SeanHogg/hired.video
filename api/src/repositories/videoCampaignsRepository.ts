/**
 * Persistence for studio video campaigns (`video_campaigns`) and their
 * ordered project membership, which lives in the `video_campaign_projects`
 * junction (gap #983, migration 0462) rather than a jsonb array.
 */
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { videoCampaigns, videoCampaignProjects, studioProjects } = schema;

export type VideoCampaignRow = typeof videoCampaigns.$inferSelect;
export type VideoCampaignInsert = typeof videoCampaigns.$inferInsert;

export const videoCampaignOwnershipColumns = {
  userIdColumn: videoCampaigns.userId,
  companyIdColumn: videoCampaigns.companyId,
};

/** Non-archived campaigns matching `ownership`, newest first. */
export async function listActiveCampaignsWhere(db: Db, ownership: SQL | undefined): Promise<VideoCampaignRow[]> {
  return db
    .select()
    .from(videoCampaigns)
    .where(and(ownership, sql`${videoCampaigns.status} != 'archived'`))
    .orderBy(desc(videoCampaigns.createdAt));
}

export async function findCampaignById(db: Db, id: string): Promise<VideoCampaignRow | null> {
  const [row] = await db.select().from(videoCampaigns).where(eq(videoCampaigns.id, id)).limit(1);
  return row ?? null;
}

export async function findCampaignOwner(db: Db, id: string): Promise<{ userId: string; companyId: string | null } | null> {
  const [row] = await db
    .select({ userId: videoCampaigns.userId, companyId: videoCampaigns.companyId })
    .from(videoCampaigns)
    .where(eq(videoCampaigns.id, id))
    .limit(1);
  return row ?? null;
}

export async function insertCampaign(db: Db, values: VideoCampaignInsert): Promise<VideoCampaignRow> {
  const [row] = await db.insert(videoCampaigns).values(values).returning();
  return row;
}

export async function updateCampaign(db: Db, id: string, patch: Partial<VideoCampaignInsert>): Promise<VideoCampaignRow | null> {
  const [row] = await db.update(videoCampaigns).set(patch).where(eq(videoCampaigns.id, id)).returning();
  return row ?? null;
}

/** Bulk-load ordered project ids for many campaigns in ONE query (no N+1). */
export async function loadCampaignProjectIds(db: Db, campaignIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (campaignIds.length === 0) return map;
  const rows = await db
    .select({ campaignId: videoCampaignProjects.campaignId, projectId: videoCampaignProjects.projectId })
    .from(videoCampaignProjects)
    .where(inArray(videoCampaignProjects.campaignId, campaignIds))
    .orderBy(asc(videoCampaignProjects.campaignId), asc(videoCampaignProjects.position));
  for (const r of rows) {
    const list = map.get(r.campaignId) ?? [];
    list.push(r.projectId);
    map.set(r.campaignId, list);
  }
  return map;
}

/**
 * Replace a campaign's membership with `projectIds` (ordered): clears the
 * existing rows, then inserts the new set. Dangling ids (no studio_projects
 * row) are dropped so the FK can't fail. Returns the project ids before and
 * after so the caller can orphan their cached watch payloads.
 */
export async function replaceCampaignProjects(
  db: Db,
  campaignId: string,
  projectIds: string[],
): Promise<{ previous: string[]; current: string[] }> {
  const previousRows = await db
    .select({ projectId: videoCampaignProjects.projectId })
    .from(videoCampaignProjects)
    .where(eq(videoCampaignProjects.campaignId, campaignId));
  const previous = previousRows.map((r) => r.projectId);
  await db.delete(videoCampaignProjects).where(eq(videoCampaignProjects.campaignId, campaignId));
  const unique = Array.from(new Set(projectIds));
  if (unique.length === 0) return { previous, current: [] };
  const existing = await db
    .select({ id: studioProjects.id })
    .from(studioProjects)
    .where(inArray(studioProjects.id, unique));
  const valid = new Set(existing.map((r) => r.id));
  const rows = unique
    .filter((id) => valid.has(id))
    .map((projectId, position) => ({ campaignId, projectId, position }));
  if (rows.length === 0) return { previous, current: [] };
  await db.insert(videoCampaignProjects).values(rows);
  return { previous, current: rows.map((r) => r.projectId) };
}
