/**
 * Company integrations service (#1441).
 *
 * Manages the `company_integrations` rows that the workforce connectors
 * (`./connectors/*`) read at runtime. List + disconnect today; the actual
 * OAuth handshake (and the `upsertIntegration` writer) is not wired yet —
 * tracked separately as #1614 in the Consolidated Gap Register.
 *
 * When the OAuth callback wiring lands it should:
 *   - encrypt access_token / refresh_token via
 *     [services/crypto/secrets.ts](../crypto/secrets.ts) — the same shared
 *     seam paid-media + email-integration use post-#1604.
 *   - insert/update via the (companyId, provider) composite unique key.
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
