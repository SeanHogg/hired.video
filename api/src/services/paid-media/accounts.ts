/**
 * Paid-media ad connections, ad accounts and insights reads — the
 * workspace-scoped use cases behind /api/paid-media/{connections,accounts,
 * insights}. Visibility = the actor's personal workspace + delegated
 * subjects + member companies (listAccessibleWorkspaces SSoT).
 */

import { getDb } from "../../db/index.js";
import { AdConnections, type AdConnectionView } from "../provider-connections/ad-connections.js";
import {
  PaidMediaAccountsRepository,
  type PaidMediaAccountRow,
} from "../../repositories/paidMediaAccountsRepository.js";
import {
  PaidMediaInsightsRepository,
  type PaidMediaInsightRow,
} from "../../repositories/paidMediaInsightsRepository.js";
import { assertCanWrite, listAccessibleWorkspaces } from "../studio/workspace.js";

async function visibleOwners(actorUserId: string, db: ReturnType<typeof getDb>) {
  const ws = await listAccessibleWorkspaces(actorUserId, { db });
  return { userIds: [actorUserId, ...ws.delegatedSubjectUserIds], companyIds: ws.companyIds };
}

export async function listAdConnections(actorUserId: string): Promise<AdConnectionView[]> {
  const db = getDb();
  const owners = await visibleOwners(actorUserId, db);
  return new AdConnections(db).listForWorkspaces(owners.userIds, owners.companyIds);
}

/** Removes a connection the actor may write; `{ deleted:false }` when absent. */
export async function deleteAdConnection(actorUserId: string, id: string): Promise<{ deleted: boolean }> {
  const db = getDb();
  const adConnections = new AdConnections(db);
  const row = await adConnections.findOwner(id);
  if (!row) return { deleted: false };
  await assertCanWrite(actorUserId, row.userId, row.companyId, { db });
  await adConnections.remove(id);
  return { deleted: true };
}

export async function listAdAccounts(actorUserId: string): Promise<PaidMediaAccountRow[]> {
  const db = getDb();
  const owners = await visibleOwners(actorUserId, db);
  return new PaidMediaAccountsRepository(db).listOwnedBy(owners.userIds, owners.companyIds);
}

/** Throws WorkspaceForbiddenError (403) when the ad account belongs to a
 *  workspace the actor cannot write. An unknown id passes through so the
 *  sync layer keeps reporting its own not-found failure. */
export async function assertAdAccountWritable(actorUserId: string, accountId: string): Promise<void> {
  const db = getDb();
  const owner = await new PaidMediaAccountsRepository(db).findOwner(accountId);
  if (!owner) return;
  await assertCanWrite(actorUserId, owner.userId, owner.companyId, { db });
}

export async function listInsights(
  actorUserId: string,
  filter: { since?: string; until?: string; internalId?: string },
): Promise<PaidMediaInsightRow[]> {
  const db = getDb();
  const owners = await visibleOwners(actorUserId, db);
  return new PaidMediaInsightsRepository(db).listForOwners({
    ownerUserIds: owners.userIds,
    ownerCompanyIds: owners.companyIds,
    ...filter,
  });
}
