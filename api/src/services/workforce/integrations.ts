/**
 * Company integrations service (#1441).
 *
 * Manages the `company_integrations` rows that the workforce connectors
 * (`./connectors/*`) read at runtime. List + connect (insert OAuth result)
 * + disconnect (status flip) — the actual OAuth handshake lives in route
 * handlers wired per provider once real client IDs are configured.
 *
 * Token encryption / decryption is intentionally NOT in this file —
 * route layer wraps the OAuth callback with the [payout/encryption.ts](../payout/encryption.ts)
 * AES-GCM helper, then calls `upsertIntegration` with already-encrypted
 * blobs. Keeping crypto out of the service means tests can pass plain
 * strings and the boundary stays small.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { ForbiddenError } from "../../middleware/errorHandler.js";
import { resolveEmployerCompanyIds } from "./index.js";

const { companyIntegrations } = schema;

export type IntegrationProvider =
  | "quickbooks"
  | "xero"
  | "gusto"
  | "docusign"
  | "helcim";

export interface UpsertIntegrationInput {
  companyId: string;
  provider: IntegrationProvider;
  accessTokenEnc?: string | null;
  refreshTokenEnc?: string | null;
  expiresAt?: Date | null;
  scopes?: string[] | null;
  externalAccountId?: string | null;
  connectedByUserId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Insert-or-update a company's integration. Triggered after a successful
 *  OAuth callback for the provider; the (companyId, provider) unique
 *  index makes this an upsert by composite natural key. */
export async function upsertIntegration(
  input: UpsertIntegrationInput,
  db = getDb(),
) {
  const now = new Date();
  const [existing] = await db.select().from(companyIntegrations)
    .where(and(
      eq(companyIntegrations.companyId, input.companyId),
      eq(companyIntegrations.provider, input.provider),
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db.update(companyIntegrations).set({
      status: "connected",
      accessTokenEnc: input.accessTokenEnc ?? existing.accessTokenEnc,
      refreshTokenEnc: input.refreshTokenEnc ?? existing.refreshTokenEnc,
      expiresAt: input.expiresAt ?? existing.expiresAt,
      scopes: input.scopes ?? existing.scopes,
      externalAccountId: input.externalAccountId ?? existing.externalAccountId,
      connectedByUserId: input.connectedByUserId ?? existing.connectedByUserId,
      metadata: input.metadata ?? existing.metadata,
      lastError: null,
      updatedAt: now,
    } as any).where(eq(companyIntegrations.id, existing.id)).returning();
    return updated;
  }

  const [created] = await db.insert(companyIntegrations).values({
    companyId: input.companyId,
    provider: input.provider,
    status: "connected",
    accessTokenEnc: input.accessTokenEnc ?? null,
    refreshTokenEnc: input.refreshTokenEnc ?? null,
    expiresAt: input.expiresAt ?? null,
    scopes: input.scopes ?? null,
    externalAccountId: input.externalAccountId ?? null,
    connectedByUserId: input.connectedByUserId ?? null,
    metadata: input.metadata ?? null,
  } as any).returning();
  return created;
}

/** Disconnect: keep the row (audit trail), flip status. Tokens stay
 *  encrypted in case the user reconnects with the same external account
 *  and wants the prior config restored. */
export async function disconnectIntegration(
  companyId: string,
  provider: IntegrationProvider,
  db = getDb(),
) {
  await db.update(companyIntegrations).set({
    status: "disconnected",
    updatedAt: new Date(),
  } as any)
    .where(and(
      eq(companyIntegrations.companyId, companyId),
      eq(companyIntegrations.provider, provider),
    ));
}

export async function listEmployerIntegrations(
  employerId: string,
  db = getDb(),
) {
  const companies = await resolveEmployerCompanyIds(employerId, db);
  if (companies.length === 0) return [];
  // Don't return raw encrypted tokens to the API consumer — strip them
  // so the UI can't leak ciphertext into the browser.
  const rows = await db.select({
    id: companyIntegrations.id,
    companyId: companyIntegrations.companyId,
    provider: companyIntegrations.provider,
    status: companyIntegrations.status,
    externalAccountId: companyIntegrations.externalAccountId,
    expiresAt: companyIntegrations.expiresAt,
    scopes: companyIntegrations.scopes,
    lastSyncAt: companyIntegrations.lastSyncAt,
    lastError: companyIntegrations.lastError,
    metadata: companyIntegrations.metadata,
    createdAt: companyIntegrations.createdAt,
    updatedAt: companyIntegrations.updatedAt,
  })
    .from(companyIntegrations)
    .orderBy(desc(companyIntegrations.updatedAt));
  return rows.filter((r) => companies.includes(r.companyId));
}

/** Employer-gated wrapper around `disconnectIntegration` — confirms the
 *  caller is an active employer on the integration's company before
 *  flipping it. */
export async function disconnectByEmployer(
  employerId: string,
  companyId: string,
  provider: IntegrationProvider,
  db = getDb(),
) {
  const companies = await resolveEmployerCompanyIds(employerId, db);
  if (!companies.includes(companyId)) {
    throw new ForbiddenError("Not an employer in this workspace");
  }
  await disconnectIntegration(companyId, provider, db);
}
