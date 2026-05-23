/**
 * Workspace-aware paid-media campaign service.
 *
 * Single mutation surface for the campaign hierarchy. Every write
 * routes through canActFor() — same SSoT used by studio. Reads use
 * buildOwnershipFilter() so personal + company + delegated rows come
 * back in one query without manual UNIONs.
 *
 * Adapters are not called here directly — `syncCampaign()` /
 * `syncAdSet()` etc. enqueue a sync job (see ./sync.ts) that resolves
 * the platform adapter, refreshes tokens, applies the diff to every
 * linked platform ref, and writes the result into
 * paid_media_platform_refs + paid_media_sync_runs.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import {
  assertCanWrite,
  buildOwnershipFilter,
  listAccessibleWorkspaces,
  resolveWorkspaceForWrite,
  type WorkspaceSelection,
} from "../studio/workspace.js";
import type {
  NewPaidMediaCampaign,
  PaidMediaCampaign,
  PaidMediaAdSet,
  NewPaidMediaAdSet,
  PaidMediaAd,
  NewPaidMediaAd,
  PaidMediaCreative,
  NewPaidMediaCreative,
} from "../../db/schema/paidmedia.js";

type DbHandle = ReturnType<typeof getDb>;

function db(deps?: { db?: DbHandle }): DbHandle {
  return deps?.db ?? getDb();
}

// ─── Campaigns ─────────────────────────────────────────────────────────────
export async function listCampaigns(
  actorUserId: string,
  selection: WorkspaceSelection,
  deps?: { db?: DbHandle },
): Promise<PaidMediaCampaign[]> {
  const d = db(deps);
  const ws = await listAccessibleWorkspaces(actorUserId, { db: d });
  const where = buildOwnershipFilter({
    userIdColumn:    schema.paidMediaCampaigns.userId,
    companyIdColumn: schema.paidMediaCampaigns.companyId,
    actorUserId,
    companyIds:      ws.companyIds,
    delegatedSubjectUserIds: ws.delegatedSubjectUserIds,
    restrictToWorkspace:
      selection?.kind === "personal"  ? { kind: "personal" } :
      selection?.kind === "company"   ? { kind: "company", companyId: selection.companyId } :
      selection?.kind === "delegated" ? { kind: "delegated", subjectUserId: selection.subjectUserId } : null,
  });
  return d.select().from(schema.paidMediaCampaigns).where(where!).orderBy(desc(schema.paidMediaCampaigns.updatedAt));
}

export async function getCampaign(
  actorUserId: string,
  id: string,
  deps?: { db?: DbHandle },
): Promise<PaidMediaCampaign> {
  const d = db(deps);
  const [row] = await d.select().from(schema.paidMediaCampaigns).where(eq(schema.paidMediaCampaigns.id, id)).limit(1);
  if (!row) throw new CampaignNotFoundError(id);
  await assertCanWrite(actorUserId, row.userId, row.companyId, { db: d });
  return row;
}

export async function createCampaign(
  actorUserId: string,
  selection: WorkspaceSelection,
  input: Omit<NewPaidMediaCampaign, "userId" | "companyId">,
  deps?: { db?: DbHandle },
): Promise<PaidMediaCampaign> {
  const d = db(deps);
  const ctx = await resolveWorkspaceForWrite(actorUserId, selection, { db: d });
  const [row] = await d.insert(schema.paidMediaCampaigns).values({
    ...input,
    userId:    ctx.ownerUserId,
    companyId: ctx.ownerCompanyId,
  } as any).returning();
  return row!;
}

export async function updateCampaign(
  actorUserId: string,
  id: string,
  patch: Partial<NewPaidMediaCampaign>,
  deps?: { db?: DbHandle },
): Promise<PaidMediaCampaign> {
  const d = db(deps);
  const existing = await getCampaign(actorUserId, id, { db: d });
  const { userId: _u, companyId: _c, ...safe } = patch;
  const [row] = await d.update(schema.paidMediaCampaigns)
    .set({ ...safe, updatedAt: new Date() })
    .where(eq(schema.paidMediaCampaigns.id, existing.id))
    .returning();
  return row!;
}

export async function deleteCampaign(actorUserId: string, id: string, deps?: { db?: DbHandle }): Promise<void> {
  const d = db(deps);
  const existing = await getCampaign(actorUserId, id, { db: d });
  await d.delete(schema.paidMediaCampaigns).where(eq(schema.paidMediaCampaigns.id, existing.id));
}

// ─── Ad Sets ───────────────────────────────────────────────────────────────
export async function listAdSets(actorUserId: string, campaignId: string, deps?: { db?: DbHandle }): Promise<PaidMediaAdSet[]> {
  const d = db(deps);
  // Loads campaign through getCampaign() which enforces ownership.
  await getCampaign(actorUserId, campaignId, { db: d });
  return d.select().from(schema.paidMediaAdSets).where(eq(schema.paidMediaAdSets.campaignId, campaignId)).orderBy(desc(schema.paidMediaAdSets.updatedAt));
}

export async function createAdSet(
  actorUserId: string,
  campaignId: string,
  input: Omit<NewPaidMediaAdSet, "campaignId" | "userId" | "companyId">,
  deps?: { db?: DbHandle },
): Promise<PaidMediaAdSet> {
  const d = db(deps);
  const campaign = await getCampaign(actorUserId, campaignId, { db: d });
  const [row] = await d.insert(schema.paidMediaAdSets).values({
    ...input,
    campaignId,
    userId:    campaign.userId,
    companyId: campaign.companyId,
  } as any).returning();
  return row!;
}

export async function updateAdSet(
  actorUserId: string,
  id: string,
  patch: Partial<NewPaidMediaAdSet>,
  deps?: { db?: DbHandle },
): Promise<PaidMediaAdSet> {
  const d = db(deps);
  const [existing] = await d.select().from(schema.paidMediaAdSets).where(eq(schema.paidMediaAdSets.id, id)).limit(1);
  if (!existing) throw new AdSetNotFoundError(id);
  await assertCanWrite(actorUserId, existing.userId, existing.companyId, { db: d });
  const { campaignId: _ci, userId: _u, companyId: _c, ...safe } = patch;
  const [row] = await d.update(schema.paidMediaAdSets)
    .set({ ...safe, updatedAt: new Date() })
    .where(eq(schema.paidMediaAdSets.id, id))
    .returning();
  return row!;
}

export async function deleteAdSet(actorUserId: string, id: string, deps?: { db?: DbHandle }): Promise<void> {
  const d = db(deps);
  const [existing] = await d.select().from(schema.paidMediaAdSets).where(eq(schema.paidMediaAdSets.id, id)).limit(1);
  if (!existing) throw new AdSetNotFoundError(id);
  await assertCanWrite(actorUserId, existing.userId, existing.companyId, { db: d });
  await d.delete(schema.paidMediaAdSets).where(eq(schema.paidMediaAdSets.id, id));
}

// ─── Ads ───────────────────────────────────────────────────────────────────
export async function listAds(actorUserId: string, adSetId: string, deps?: { db?: DbHandle }): Promise<PaidMediaAd[]> {
  const d = db(deps);
  const [adSet] = await d.select().from(schema.paidMediaAdSets).where(eq(schema.paidMediaAdSets.id, adSetId)).limit(1);
  if (!adSet) throw new AdSetNotFoundError(adSetId);
  await assertCanWrite(actorUserId, adSet.userId, adSet.companyId, { db: d });
  return d.select().from(schema.paidMediaAds).where(eq(schema.paidMediaAds.adSetId, adSetId)).orderBy(desc(schema.paidMediaAds.updatedAt));
}

export async function createAd(
  actorUserId: string,
  adSetId: string,
  input: Omit<NewPaidMediaAd, "adSetId" | "userId" | "companyId">,
  deps?: { db?: DbHandle },
): Promise<PaidMediaAd> {
  const d = db(deps);
  const [adSet] = await d.select().from(schema.paidMediaAdSets).where(eq(schema.paidMediaAdSets.id, adSetId)).limit(1);
  if (!adSet) throw new AdSetNotFoundError(adSetId);
  await assertCanWrite(actorUserId, adSet.userId, adSet.companyId, { db: d });
  const [row] = await d.insert(schema.paidMediaAds).values({
    ...input,
    adSetId,
    userId:    adSet.userId,
    companyId: adSet.companyId,
  } as any).returning();
  return row!;
}

export async function updateAd(actorUserId: string, id: string, patch: Partial<NewPaidMediaAd>, deps?: { db?: DbHandle }): Promise<PaidMediaAd> {
  const d = db(deps);
  const [existing] = await d.select().from(schema.paidMediaAds).where(eq(schema.paidMediaAds.id, id)).limit(1);
  if (!existing) throw new AdNotFoundError(id);
  await assertCanWrite(actorUserId, existing.userId, existing.companyId, { db: d });
  const { adSetId: _a, userId: _u, companyId: _c, ...safe } = patch;
  const [row] = await d.update(schema.paidMediaAds)
    .set({ ...safe, updatedAt: new Date() })
    .where(eq(schema.paidMediaAds.id, id))
    .returning();
  return row!;
}

export async function deleteAd(actorUserId: string, id: string, deps?: { db?: DbHandle }): Promise<void> {
  const d = db(deps);
  const [existing] = await d.select().from(schema.paidMediaAds).where(eq(schema.paidMediaAds.id, id)).limit(1);
  if (!existing) throw new AdNotFoundError(id);
  await assertCanWrite(actorUserId, existing.userId, existing.companyId, { db: d });
  await d.delete(schema.paidMediaAds).where(eq(schema.paidMediaAds.id, id));
}

// ─── Creatives ─────────────────────────────────────────────────────────────
export async function listCreatives(actorUserId: string, selection: WorkspaceSelection, deps?: { db?: DbHandle }): Promise<PaidMediaCreative[]> {
  const d = db(deps);
  const ws = await listAccessibleWorkspaces(actorUserId, { db: d });
  const where = buildOwnershipFilter({
    userIdColumn:    schema.paidMediaCreatives.userId,
    companyIdColumn: schema.paidMediaCreatives.companyId,
    actorUserId,
    companyIds:      ws.companyIds,
    delegatedSubjectUserIds: ws.delegatedSubjectUserIds,
    restrictToWorkspace:
      selection?.kind === "personal"  ? { kind: "personal" } :
      selection?.kind === "company"   ? { kind: "company", companyId: selection.companyId } :
      selection?.kind === "delegated" ? { kind: "delegated", subjectUserId: selection.subjectUserId } : null,
  });
  return d.select().from(schema.paidMediaCreatives).where(where!).orderBy(desc(schema.paidMediaCreatives.updatedAt));
}

export async function createCreative(
  actorUserId: string,
  selection: WorkspaceSelection,
  input: Omit<NewPaidMediaCreative, "userId" | "companyId">,
  deps?: { db?: DbHandle },
): Promise<PaidMediaCreative> {
  const d = db(deps);
  const ctx = await resolveWorkspaceForWrite(actorUserId, selection, { db: d });
  const [row] = await d.insert(schema.paidMediaCreatives).values({
    ...input,
    userId:    ctx.ownerUserId,
    companyId: ctx.ownerCompanyId,
  } as any).returning();
  return row!;
}

export async function updateCreative(actorUserId: string, id: string, patch: Partial<NewPaidMediaCreative>, deps?: { db?: DbHandle }): Promise<PaidMediaCreative> {
  const d = db(deps);
  const [existing] = await d.select().from(schema.paidMediaCreatives).where(eq(schema.paidMediaCreatives.id, id)).limit(1);
  if (!existing) throw new CreativeNotFoundError(id);
  await assertCanWrite(actorUserId, existing.userId, existing.companyId, { db: d });
  const { userId: _u, companyId: _c, ...safe } = patch;
  const [row] = await d.update(schema.paidMediaCreatives)
    .set({ ...safe, updatedAt: new Date() })
    .where(eq(schema.paidMediaCreatives.id, id))
    .returning();
  return row!;
}

export async function deleteCreative(actorUserId: string, id: string, deps?: { db?: DbHandle }): Promise<void> {
  const d = db(deps);
  const [existing] = await d.select().from(schema.paidMediaCreatives).where(eq(schema.paidMediaCreatives.id, id)).limit(1);
  if (!existing) throw new CreativeNotFoundError(id);
  await assertCanWrite(actorUserId, existing.userId, existing.companyId, { db: d });
  await d.delete(schema.paidMediaCreatives).where(eq(schema.paidMediaCreatives.id, id));
}

// ─── Errors ────────────────────────────────────────────────────────────────
export class CampaignNotFoundError extends Error { constructor(id: string) { super(`Campaign ${id} not found`); this.name = "CampaignNotFoundError"; } }
export class AdSetNotFoundError    extends Error { constructor(id: string) { super(`Ad set ${id} not found`);    this.name = "AdSetNotFoundError"; } }
export class AdNotFoundError       extends Error { constructor(id: string) { super(`Ad ${id} not found`);        this.name = "AdNotFoundError"; } }
export class CreativeNotFoundError extends Error { constructor(id: string) { super(`Creative ${id} not found`);  this.name = "CreativeNotFoundError"; } }
