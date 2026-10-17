/**
 * The lms_connectors columns that are safe to return to API clients — every
 * column except the credentials (access/refresh tokens, plaintext or `_enc`)
 * and the provider metadata. Used by every route that returns a connector row
 * so a `.returning()` can never echo a token back.
 */
import { schema } from "../../db/index.js";

const { lmsConnectors } = schema;

export const lmsConnectorPublicColumns = {
  id: lmsConnectors.id,
  provider: lmsConnectors.provider,
  displayName: lmsConnectors.displayName,
  baseUrl: lmsConnectors.baseUrl,
  status: lmsConnectors.status,
  expiresAt: lmsConnectors.expiresAt,
  lastSyncAt: lmsConnectors.lastSyncAt,
  lastError: lmsConnectors.lastError,
  createdAt: lmsConnectors.createdAt,
  updatedAt: lmsConnectors.updatedAt,
};
