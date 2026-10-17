/**
 * Company integrations service (#1441).
 *
 * Manages the `company_integrations` rows that the workforce connectors
 * (`./connectors/*`) read at runtime. List + disconnect + upsert.
 * The actual OAuth handshake per provider is still TODO — when a
 * provider OAuth callback lands it calls `upsertIntegration` with
 * plaintext tokens; this module encrypts them through the shared crypto
 * seam at [services/crypto/secrets.ts](../crypto/secrets.ts) before
 * writing.
 *
 * Encryption routes through the same shared module paid-media + email-
 * integration use post-#1604, so no per-service envelope-encryption
 * implementation lives here. The HKDF info label is workforce-specific
 * so legacy ciphertexts (if any) derive a distinct AES key.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { ForbiddenError } from "../../middleware/errorHandler.js";
import { resolveEmployerCompanyIds } from "./tenancy.js";
import {
  encryptSecret,
  type SecretsContext,
} from "../crypto/secrets.js";

const { companyIntegrations } = schema;

export type IntegrationProvider =
  | "quickbooks"
  | "xero"
  | "gusto"
  | "docusign"
  | "helcim";

const WORKFORCE_INFO_LABEL = "hired.video/workforce-integration/v1";

function workforceSecretsContext(env: { WORKFORCE_KMS_KEY?: string }): SecretsContext {
  if (!env.WORKFORCE_KMS_KEY) {
    throw new Error("WORKFORCE_KMS_KEY env var not set");
  }
  return { info: WORKFORCE_INFO_LABEL, masterKey: env.WORKFORCE_KMS_KEY };
}

export interface UpsertIntegrationInput {
  companyId: string;
  provider: IntegrationProvider;
  /** PLAINTEXT access token from the OAuth callback. This module
   *  encrypts before writing — never store the plaintext value. */
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string[] | null;
  externalAccountId?: string | null;
  connectedByUserId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Insert-or-update a company's integration after a successful OAuth
 *  callback. The (companyId, provider) composite unique key makes this
 *  an upsert by composite natural key. Plaintext tokens are encrypted
 *  via the shared crypto seam before write. */
export async function upsertIntegration(
  input: UpsertIntegrationInput,
  env: { WORKFORCE_KMS_KEY?: string },
  db = getDb(),
) {
  const ctx = workforceSecretsContext(env);
  const accessTokenEnc = input.accessToken
    ? await encryptSecret(ctx, input.accessToken)
    : null;
  const refreshTokenEnc = input.refreshToken
    ? await encryptSecret(ctx, input.refreshToken)
    : null;
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
      accessTokenEnc: accessTokenEnc ?? existing.accessTokenEnc,
      refreshTokenEnc: refreshTokenEnc ?? existing.refreshTokenEnc,
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
    accessTokenEnc,
    refreshTokenEnc,
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
