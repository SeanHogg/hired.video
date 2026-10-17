/**
 * Studio video-campaign use cases: workspace-scoped list, create, patch,
 * archive, and the analytics rollup. Membership is junction-backed (gap
 * #983); the DTO still exposes a flat `projectIds: string[]`. Every
 * membership / UTM / status change orphans the members' cached public watch
 * payloads (campaign UTMs bake into the player's CTA hot-zones).
 */
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  findCampaignById,
  findCampaignOwner,
  insertCampaign,
  listActiveCampaignsWhere,
  loadCampaignProjectIds,
  replaceCampaignProjects,
  updateCampaign,
  videoCampaignOwnershipColumns,
  type VideoCampaignInsert,
  type VideoCampaignRow,
} from "../../repositories/videoCampaignsRepository.js";
import { countEventsForProjects } from "../../repositories/videoAnalyticsRepository.js";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { bumpPublicWatchCache } from "./public-watch-cache.js";
import { assertCanWrite, buildOwnershipFilter, listAccessibleWorkspaces } from "./workspace.js";
import { resolveWorkspaceFromBody, type WorkspaceRestriction } from "./workspace-request.js";

export const CampaignSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  utmSource:   z.string().max(100).optional(),
  utmMedium:   z.string().max(100).optional(),
  utmCampaign: z.string().max(100).optional(),
  projectIds:  z.array(UuidLikeSchema).default([]),
});
export type CampaignInput = z.infer<typeof CampaignSchema>;

type CampaignDto = VideoCampaignRow & { projectIds: string[] };

const notFound = () => new DomainError(404, "NOT_FOUND", "Campaign not found");

function toCampaignDto(campaign: VideoCampaignRow, projectIds: string[]): CampaignDto {
  return { ...campaign, projectIds };
}

/** Write the ordered membership, then orphan every affected watch payload. */
async function setCampaignProjects(campaignId: string, projectIds: string[]): Promise<void> {
  const { previous, current } = await replaceCampaignProjects(getDb(), campaignId, projectIds);
  bumpPublicWatchCache(...previous, ...current);
}

export async function listCampaigns(userId: string, restrictToWorkspace: WorkspaceRestriction | undefined): Promise<CampaignDto[]> {
  const db = getDb();
  const { companyIds, delegatedSubjectUserIds } = await listAccessibleWorkspaces(userId);
  const ownership = buildOwnershipFilter({
    ...videoCampaignOwnershipColumns,
    actorUserId: userId,
    companyIds,
    delegatedSubjectUserIds,
    restrictToWorkspace,
  });
  const campaigns = await listActiveCampaignsWhere(db, ownership);
  const projectIdsByCampaign = await loadCampaignProjectIds(db, campaigns.map((c) => c.id));
  return campaigns.map((campaign) => toCampaignDto(campaign, projectIdsByCampaign.get(campaign.id) ?? []));
}

/** `body` carries the optional `workspace` selection next to the fields. */
export async function createCampaign(userId: string, input: CampaignInput, body: unknown): Promise<CampaignDto> {
  const target = await resolveWorkspaceFromBody(userId, body);
  const { projectIds, ...campaignFields } = input;
  const campaign = await insertCampaign(getDb(), {
    ...campaignFields,
    userId: target.ownerUserId,
    companyId: target.ownerCompanyId,
  } as VideoCampaignInsert);
  await setCampaignProjects(campaign.id, projectIds);
  return toCampaignDto(campaign, projectIds);
}

/** Loose patch: present string fields are applied; `projectIds` replaces membership. */
export async function patchCampaign(userId: string, campaignId: string, body: Record<string, unknown>): Promise<CampaignDto> {
  const db = getDb();
  const existing = await findCampaignOwner(db, campaignId);
  if (!existing) throw notFound();
  await assertCanWrite(userId, existing.userId, existing.companyId ?? null);
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of ["name", "description", "utmSource", "utmMedium", "utmCampaign", "status"] as const) {
    if (typeof body[key] === "string") updates[key] = body[key];
  }
  if (Array.isArray(body.projectIds)) {
    await setCampaignProjects(campaignId, body.projectIds as string[]);
  }
  const updated = await updateCampaign(db, campaignId, updates as Partial<VideoCampaignInsert>);
  if (!updated) throw notFound();
  const projectIds = (await loadCampaignProjectIds(db, [campaignId])).get(campaignId) ?? [];
  // UTM / status edits bake into public watch hotzones; bump AFTER the
  // campaign row is committed so a concurrent fill cannot recache old tags.
  bumpPublicWatchCache(...projectIds);
  return toCampaignDto(updated, projectIds);
}

/** Soft delete (status → archived). A missing campaign reports `{ archived: false }`. */
export async function archiveCampaign(userId: string, campaignId: string): Promise<{ archived: boolean }> {
  const db = getDb();
  const existing = await findCampaignOwner(db, campaignId);
  if (!existing) return { archived: false };
  await assertCanWrite(userId, existing.userId, existing.companyId ?? null);
  const members = (await loadCampaignProjectIds(db, [campaignId])).get(campaignId) ?? [];
  await updateCampaign(db, campaignId, { status: "archived", updatedAt: new Date() } as Partial<VideoCampaignInsert>);
  bumpPublicWatchCache(...members);
  return { archived: true };
}

export async function campaignStats(userId: string, campaignId: string) {
  const db = getDb();
  const campaign = await findCampaignById(db, campaignId);
  if (!campaign) throw notFound();
  await assertCanWrite(userId, campaign.userId, campaign.companyId ?? null);
  const projectIds = (await loadCampaignProjectIds(db, [campaign.id])).get(campaign.id) ?? [];
  if (projectIds.length === 0) return { views: 0, ctaClicks: 0, shares: 0, projectCount: 0 };
  const stats = await countEventsForProjects(db, projectIds);
  return {
    campaignId: campaign.id,
    projectCount: projectIds.length,
    views: stats["view"] ?? 0,
    ctaClicks: stats["cta_click"] ?? 0,
    shares: stats["share"] ?? 0,
  };
}
