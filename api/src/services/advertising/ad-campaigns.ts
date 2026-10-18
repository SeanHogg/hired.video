/**
 * On-platform ad campaigns + ad sets (gap #108/#109) — owner-scoped CRUD
 * behind /api/advertising/campaigns and /api/advertising/ad-sets.
 * Missing / foreign rows surface as a 404 DomainError. Update patches
 * arrive with undefined keys already dropped (routes/advertising definedOnly).
 */

import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  AdCampaignsRepository,
  type AdCampaignInsert,
  type AdCampaignRow,
  type AdSetInsert,
  type AdSetRow,
} from "../../repositories/adCampaignsRepository.js";

interface Schedule {
  startAt?: string;
  endAt?: string;
}

const campaignNotFound = () => new DomainError(404, "NOT_FOUND", "Campaign not found");
const adSetNotFound = () => new DomainError(404, "NOT_FOUND", "Ad set not found");

function repo(): AdCampaignsRepository {
  return new AdCampaignsRepository(getDb());
}

/** ISO strings → Date for the timestamp columns; omitted keys stay omitted. */
function withDates<T extends Schedule>(input: T): Omit<T, keyof Schedule> & { startAt?: Date; endAt?: Date } {
  const { startAt, endAt, ...rest } = input;
  return {
    ...rest,
    ...(startAt !== undefined ? { startAt: new Date(startAt) } : {}),
    ...(endAt !== undefined ? { endAt: new Date(endAt) } : {}),
  };
}

// ─── Campaigns ───────────────────────────────────────────────────────────────
export function listAdCampaigns(userId: string): Promise<AdCampaignRow[]> {
  return repo().listCampaignsForUser(userId);
}

export function createAdCampaign(userId: string, input: Schedule & Record<string, unknown>): Promise<AdCampaignRow> {
  return repo().insertCampaign({ ...withDates(input), userId } as AdCampaignInsert);
}

export async function updateAdCampaign(userId: string, id: string, patch: Schedule & Record<string, unknown>): Promise<AdCampaignRow> {
  const row = await repo().updateCampaignForUser(id, userId, withDates(patch) as Partial<AdCampaignInsert>);
  if (!row) throw campaignNotFound();
  return row;
}

export async function deleteAdCampaign(userId: string, id: string): Promise<void> {
  if (!(await repo().deleteCampaignForUser(id, userId))) throw campaignNotFound();
}

// ─── Ad sets ─────────────────────────────────────────────────────────────────
export async function listAdSets(userId: string, campaignId: string): Promise<AdSetRow[]> {
  const r = repo();
  if (!(await r.findCampaignForUser(campaignId, userId))) throw campaignNotFound();
  return r.listAdSetsForCampaign(campaignId);
}

export async function createAdSet(
  userId: string,
  campaignId: string,
  input: Schedule & { targetingJson?: unknown } & Record<string, unknown>,
): Promise<AdSetRow> {
  const r = repo();
  if (!(await r.findCampaignForUser(campaignId, userId))) throw campaignNotFound();
  return r.insertAdSet({
    campaignId,
    userId,
    ...withDates(input),
    targetingJson: input.targetingJson ?? {},
  } as AdSetInsert);
}

export async function updateAdSet(userId: string, id: string, patch: Schedule & Record<string, unknown>): Promise<AdSetRow> {
  const row = await repo().updateAdSetForUser(id, userId, withDates(patch) as Partial<AdSetInsert>);
  if (!row) throw adSetNotFound();
  return row;
}

export async function deleteAdSet(userId: string, id: string): Promise<void> {
  if (!(await repo().deleteAdSetForUser(id, userId))) throw adSetNotFound();
}
