/**
 * Partner API key service — minting + validating partner system-to-system
 * keys. Mirrors the company embed-key design (prefix + SHA-256 hash, full key
 * returned once) but partner-scoped. The key authenticates the partner's
 * BACKEND to Hired.Video; it is never exposed to a browser.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { PARTNER_KEY_PREFIX, type PartnerScope } from "../../../../shared/partner.js";

const { partnerApiKeys, partners } = schema;

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** `hvpk_<48 hex chars>` — partner key family, long entropy. */
export async function generatePartnerKey(): Promise<{ key: string; prefix: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const key = `${PARTNER_KEY_PREFIX}${hex}`;
  const prefix = key.slice(0, 12);
  const hash = await sha256Hex(key);
  return { key, prefix, hash };
}

export type PartnerApiKeyRow = typeof partnerApiKeys.$inferSelect;

/** Safe projection — never returns key_hash. */
export interface PartnerApiKeyView {
  id: string;
  partnerId: string;
  label: string;
  keyPrefix: string;
  scopes: string[];
  allowedOrigins: string[];
  isActive: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export function toPartnerKeyView(row: PartnerApiKeyRow): PartnerApiKeyView {
  return {
    id: row.id,
    partnerId: row.partnerId,
    label: row.label,
    keyPrefix: row.keyPrefix,
    scopes: row.scopes as string[],
    allowedOrigins: row.allowedOrigins as string[],
    isActive: row.isActive,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export async function listPartnerApiKeys(
  partnerId: string,
  db = getDb(),
): Promise<PartnerApiKeyView[]> {
  const rows = await db
    .select()
    .from(partnerApiKeys)
    .where(eq(partnerApiKeys.partnerId, partnerId))
    .orderBy(desc(partnerApiKeys.createdAt));
  return rows.map(toPartnerKeyView);
}

export interface CreatePartnerKeyInput {
  partnerId: string;
  label: string;
  scopes: PartnerScope[];
  allowedOrigins?: string[];
  createdBy?: string | null;
  expiresInDays?: number | null;
}

/** Create a key; the full plaintext key is returned ONCE and never stored. */
export async function createPartnerApiKey(
  input: CreatePartnerKeyInput,
  db = getDb(),
): Promise<{ key: string; view: PartnerApiKeyView }> {
  const { key, prefix, hash } = await generatePartnerKey();
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : null;
  const [row] = await db
    .insert(partnerApiKeys)
    .values({
      partnerId: input.partnerId,
      label: input.label,
      keyPrefix: prefix,
      keyHash: hash,
      scopes: input.scopes,
      allowedOrigins: input.allowedOrigins ?? [],
      createdBy: input.createdBy ?? null,
      expiresAt,
    } as any)
    .returning();
  return { key, view: toPartnerKeyView(row as PartnerApiKeyRow) };
}

/** Soft-revoke — scoped to the partner so a key can't be revoked cross-partner. */
export async function revokePartnerApiKey(
  partnerId: string,
  keyId: string,
  db = getDb(),
): Promise<boolean> {
  const rows = await db
    .update(partnerApiKeys)
    .set({ isActive: false } as any)
    .where(and(eq(partnerApiKeys.id, keyId), eq(partnerApiKeys.partnerId, partnerId)))
    .returning({ id: partnerApiKeys.id });
  return rows.length > 0;
}

// ── Runtime validation ──────────────────────────────────────────────────────
export class PartnerAuthError extends Error {
  constructor(
    public readonly code:
      | "INVALID_KEY"
      | "EXPIRED"
      | "FORBIDDEN_SCOPE"
      | "PARTNER_SUSPENDED",
    message: string,
    public readonly status: 401 | 403 = 401,
  ) {
    super(message);
  }
}

export interface PartnerAuthResult {
  partnerId: string;
  keyId: string;
  scopes: PartnerScope[];
}

/**
 * Validate a raw partner key and (optionally) require a scope. The single
 * chokepoint every partner request runs behind: key active + not expired +
 * partner not suspended + scope granted. Bumps last_used_at (best-effort).
 */
export async function resolvePartnerRequest(
  rawKey: string | null | undefined,
  requiredScope: PartnerScope | null,
  db = getDb(),
): Promise<PartnerAuthResult> {
  if (!rawKey || !rawKey.startsWith(PARTNER_KEY_PREFIX)) {
    throw new PartnerAuthError("INVALID_KEY", "Missing or malformed partner API key.");
  }
  const hash = await sha256Hex(rawKey);
  const [row] = await db
    .select()
    .from(partnerApiKeys)
    .where(and(eq(partnerApiKeys.keyHash, hash), eq(partnerApiKeys.isActive, true)))
    .limit(1);
  if (!row) throw new PartnerAuthError("INVALID_KEY", "Invalid or revoked partner API key.");
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    throw new PartnerAuthError("EXPIRED", "Partner API key has expired.");
  }

  const scopes = row.scopes as PartnerScope[];
  if (requiredScope && !scopes.includes(requiredScope)) {
    throw new PartnerAuthError(
      "FORBIDDEN_SCOPE",
      `This key is missing the required "${requiredScope}" scope.`,
      403,
    );
  }

  const [partner] = await db
    .select({ status: partners.status })
    .from(partners)
    .where(eq(partners.id, row.partnerId))
    .limit(1);
  if (!partner || partner.status !== "active") {
    throw new PartnerAuthError("PARTNER_SUSPENDED", "This partner account is not active.", 403);
  }

  await db
    .update(partnerApiKeys)
    .set({ lastUsedAt: new Date() } as any)
    .where(eq(partnerApiKeys.id, row.id))
    .catch(() => undefined);

  return { partnerId: row.partnerId, keyId: row.id, scopes };
}
