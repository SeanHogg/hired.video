// Personal API keys (routes/apikeys.ts): list / create / revoke / rename.
// Only the SHA-256 hash and a display prefix are stored; the plaintext key
// is returned once, at creation.

import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { AuthzRepository, type ApiKeyRow, type IAuthzRepository } from "../../repositories/authzRepository.js";
import { randomHex, sha256Hex } from "../../utils/crypto.js";

export type ApiKeySummary = Pick<
  ApiKeyRow,
  "id" | "name" | "keyPrefix" | "scopes" | "isActive" | "lastUsedAt" | "expiresAt" | "createdAt"
>;

export type CreatedApiKey = Pick<ApiKeyRow, "id" | "name" | "keyPrefix" | "scopes" | "expiresAt" | "createdAt"> & {
  key: string;
  warning: string;
};

function repo(): IAuthzRepository {
  return new AuthzRepository(getDb());
}

// Generates a cryptographically random API key: hvk_<48 random hex chars>
async function generateApiKey(): Promise<{ key: string; prefix: string; hash: string }> {
  const key = `hvk_${randomHex(24)}`;
  const prefix = key.slice(0, 12); // "hvk_" + first 8 hex chars
  // SHA-256 hash of the full key (stored in DB for validation)
  const hash = await sha256Hex(key);
  return { key, prefix, hash };
}

const notFound = () => new DomainError(404, "NOT_FOUND", "API key not found");

/** Prefix + metadata only, never the hash or full key; newest first. */
export async function listApiKeys(userId: string): Promise<ApiKeySummary[]> {
  const rows = await repo().findApiKeysForUser(userId);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    keyPrefix: r.keyPrefix,
    scopes: r.scopes,
    isActive: r.isActive,
    lastUsedAt: r.lastUsedAt,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  }));
}

export async function createApiKey(
  userId: string,
  input: { name: string; scopes: string[]; expiresInDays?: number },
): Promise<CreatedApiKey> {
  const { key, prefix, hash } = await generateApiKey();
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : undefined;

  const created = await repo().insertApiKey({
    userId,
    name: input.name,
    keyPrefix: prefix,
    keyHash: hash,
    scopes: input.scopes,
    isActive: true,
    expiresAt,
  });

  // Return the full key ONCE — it is never stored in plaintext
  return {
    id: created.id,
    name: created.name,
    keyPrefix: created.keyPrefix,
    scopes: created.scopes,
    expiresAt: created.expiresAt,
    createdAt: created.createdAt,
    key, // plaintext key shown only at creation
    warning: "Save this key now. It will not be shown again.",
  };
}

export async function revokeApiKey(userId: string, id: string): Promise<{ revoked: true; id: string }> {
  if (!(await repo().revokeApiKey(id, userId))) throw notFound();
  return { revoked: true, id };
}

export async function renameApiKey(userId: string, id: string, name: string): Promise<{ id: string; name: string }> {
  const updated = await repo().renameApiKey(id, userId, name);
  if (!updated) throw notFound();
  return updated;
}
