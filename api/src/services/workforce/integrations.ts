/**
 * Company integrations service (#1441).
 *
 * Manages the company workforce connections the connectors
 * (`./connectors/*`) read at runtime — provider_connections purpose
 * "workforce" (W3-C, was company_integrations), through the
 * WorkforceIntegrations adapter. List + disconnect + upsert.
 * The actual OAuth handshake per provider is still TODO — when a
 * provider OAuth callback lands it calls `upsertIntegration` with
 * plaintext tokens; the adapter seals them with the one connection-secrets
 * scheme (services/provider-connections/connection-secrets.ts) before
 * writing.
 */

import { getDb } from "../../db/index.js";
import { ForbiddenError } from "../../middleware/errorHandler.js";
import { resolveEmployerCompanyIds } from "./index.js";
import {
  WorkforceIntegrations,
  type UpsertWorkforceIntegrationInput,
} from "../provider-connections/workforce-integrations.js";

export type IntegrationProvider =
  | "quickbooks"
  | "xero"
  | "gusto"
  | "docusign"
  | "helcim";

export interface UpsertIntegrationInput extends UpsertWorkforceIntegrationInput {
  provider: IntegrationProvider;
}

/** Insert-or-update a company's integration after a successful OAuth
 *  callback. The (companyId, provider) natural key makes this an upsert.
 *  Plaintext tokens are sealed by the adapter before write. */
export async function upsertIntegration(input: UpsertIntegrationInput, db = getDb()) {
  return new WorkforceIntegrations(db).upsert(input);
}

/** Disconnect: keep the row (audit trail), flip status. Tokens stay
 *  encrypted in case the user reconnects with the same external account
 *  and wants the prior config restored. */
export async function disconnectIntegration(
  companyId: string,
  provider: IntegrationProvider,
  db = getDb(),
) {
  await new WorkforceIntegrations(db).disconnect(companyId, provider);
}

export async function listEmployerIntegrations(
  employerId: string,
  db = getDb(),
) {
  const companies = await resolveEmployerCompanyIds(employerId, db);
  if (companies.length === 0) return [];
  // The adapter never returns tokens, so ciphertext can't leak into the browser.
  return new WorkforceIntegrations(db).listForCompanies(companies);
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
