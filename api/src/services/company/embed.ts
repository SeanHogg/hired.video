/**
 * Company embed service — minting + validating company-scoped embed keys and
 * generating the copyable snippet. Mirrors the user api_keys design (prefix +
 * SHA-256 hash, full key returned once) but company-scoped.
 *
 * The snippet NEVER contains the real key: it carries an env-var placeholder
 * so the key is injected at build/deploy time and never committed. See
 * shared/embed.ts.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { EMBED_KEY_PLACEHOLDER, EMBED_SURFACES } from "../../../../shared/embed.js";
import { resolveSegmentForCompany } from "../people-ops/segment.js";
import type { PeopleSegmentScope } from "../people-ops/segment.js";
import { randomHex, sha256Hex } from "../../utils/crypto.js";
import { publicAppBaseUrl } from "../../utils/public-urls.js";
import { DomainError } from "../../domains/errors.js";
import { CompaniesRepository } from "../../repositories/companiesRepository.js";

const { companyEmbedKeys } = schema;

/** hvk_<48 hex chars> — same family as user api keys, longer entropy. */
export async function generateEmbedKey(): Promise<{ key: string; prefix: string; hash: string }> {
  const key = `hvk_${randomHex(24)}`;
  const prefix = key.slice(0, 12);
  const hash = await sha256Hex(key);
  return { key, prefix, hash };
}

export type EmbedKeyRow = typeof companyEmbedKeys.$inferSelect;

/** Safe projection — never returns key_hash. */
export interface EmbedKeyView {
  id: string;
  label: string;
  keyPrefix: string;
  scopes: string[];
  allowedOrigins: string[];
  isActive: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

function toKeyView(row: EmbedKeyRow): EmbedKeyView {
  return {
    id: row.id,
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

export async function listEmbedKeys(
  companyId: string,
  db = getDb(),
): Promise<EmbedKeyView[]> {
  const rows = await db
    .select()
    .from(companyEmbedKeys)
    .where(eq(companyEmbedKeys.companyId, companyId))
    .orderBy(desc(companyEmbedKeys.createdAt));
  return rows.map(toKeyView);
}

export interface CreateEmbedKeyInput {
  companyId: string;
  label: string;
  scopes: string[];
  allowedOrigins: string[];
  createdBy: string;
  /** Optional expiry (#1828) — when set, the key auto-rejects after this many
   *  days (`resolveEmbedRequest` already enforces `expiresAt`). Omit for a
   *  non-expiring key. */
  expiresInDays?: number | null;
}

/** Create a key; the full plaintext key is returned ONCE and never stored. */
export async function createEmbedKey(
  input: CreateEmbedKeyInput,
  db = getDb(),
): Promise<{ key: string; view: EmbedKeyView }> {
  const { key, prefix, hash } = await generateEmbedKey();
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : null;
  const [row] = await db
    .insert(companyEmbedKeys)
    .values({
      companyId: input.companyId,
      label: input.label,
      keyPrefix: prefix,
      keyHash: hash,
      scopes: input.scopes,
      allowedOrigins: input.allowedOrigins,
      createdBy: input.createdBy,
      expiresAt,
    })
    .returning();
  return { key, view: toKeyView(row as EmbedKeyRow) };
}

/** Rotate a key (#1828): revoke the old one and mint a fresh key inheriting its
 *  label / scopes / allowed origins, so an embed can roll its secret without
 *  reconfiguring. Company-scoped; returns null when the key isn't found. */
export async function rotateEmbedKey(
  companyId: string,
  keyId: string,
  createdBy: string,
  expiresInDays: number | null = null,
  db = getDb(),
): Promise<{ key: string; view: EmbedKeyView } | null> {
  const [old] = await db
    .select()
    .from(companyEmbedKeys)
    .where(and(eq(companyEmbedKeys.id, keyId), eq(companyEmbedKeys.companyId, companyId)))
    .limit(1);
  if (!old) return null;
  await db
    .update(companyEmbedKeys)
    .set({ isActive: false })
    .where(and(eq(companyEmbedKeys.id, keyId), eq(companyEmbedKeys.companyId, companyId)));
  const o = old as EmbedKeyRow;
  return createEmbedKey(
    {
      companyId,
      label: o.label,
      scopes: o.scopes as string[],
      allowedOrigins: o.allowedOrigins as string[],
      createdBy,
      expiresInDays,
    },
    db,
  );
}

/** Soft-revoke (isActive=false) — scoped to the company so a key can't be
 *  revoked cross-company. */
export async function revokeEmbedKey(
  companyId: string,
  keyId: string,
  db = getDb(),
): Promise<boolean> {
  const rows = await db
    .update(companyEmbedKeys)
    .set({ isActive: false })
    .where(and(eq(companyEmbedKeys.id, keyId), eq(companyEmbedKeys.companyId, companyId)))
    .returning({ id: companyEmbedKeys.id });
  return rows.length > 0;
}

// ── Embed runtime validation (#1826/#1828) ──────────────────────────────────
export type EmbedAuthErrorCode = "INVALID_KEY" | "EXPIRED" | "FORBIDDEN_ORIGIN" | "FORBIDDEN_SCOPE" | "NOT_ENABLED";

/** Bad/expired key → 401; origin/scope/disabled → 403. */
export class EmbedAuthError extends DomainError {
  declare readonly code: EmbedAuthErrorCode;
  constructor(code: EmbedAuthErrorCode, message: string) {
    super(code === "INVALID_KEY" || code === "EXPIRED" ? 401 : 403, code, message);
    this.name = "EmbedAuthError";
  }
}

export interface EmbedAuthResult {
  scope: PeopleSegmentScope;
  companyId: string;
  scopes: string[];
  allowedOrigins: string[];
}

export interface ResolveEmbedOpts {
  origin?: string | null;
  /** When true, reject if `origin` isn't in the key's allowlist. Off by
   *  default: the cross-site gate is the frame's `frame-ancestors` CSP, and
   *  the data API is fetched same-origin from that trusted frame. */
  enforceOrigin?: boolean;
}

export function originAllowed(origin: string | null, allowed: string[]): boolean {
  if (allowed.length === 0) return true; // no allowlist configured → unrestricted
  if (!origin) return false;
  const norm = (u: string) => u.replace(/\/$/, "").toLowerCase();
  return allowed.map(norm).includes(norm(origin));
}

/**
 * Validate an embed key for a view + caller origin, then resolve the company's
 * People-Ops segment. The single chokepoint the embed data API runs behind:
 * enforces key active + not expired + scope granted + origin allowlisted +
 * company embedding still enabled. Bumps last_used_at (best-effort).
 */
export async function resolveEmbedRequest(
  rawKey: string,
  viewKey: string,
  opts: ResolveEmbedOpts = {},
  db = getDb(),
): Promise<EmbedAuthResult> {
  if (!rawKey) throw new EmbedAuthError("INVALID_KEY", "Missing embed key.");
  const hash = await sha256Hex(rawKey);
  const [row] = await db
    .select()
    .from(companyEmbedKeys)
    .where(and(eq(companyEmbedKeys.keyHash, hash), eq(companyEmbedKeys.isActive, true)))
    .limit(1);
  if (!row) throw new EmbedAuthError("INVALID_KEY", "Invalid or revoked embed key.");
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    throw new EmbedAuthError("EXPIRED", "Embed key has expired.");
  }

  const surface = EMBED_SURFACES.find((s) => s.key === viewKey);
  if (!surface) throw new EmbedAuthError("FORBIDDEN_SCOPE", "Unknown embed view.");
  const scopes = row.scopes as string[];
  if (!scopes.includes(surface.scope)) {
    throw new EmbedAuthError("FORBIDDEN_SCOPE", "This key may not render that view.");
  }
  const allowedOrigins = row.allowedOrigins as string[];
  if (opts.enforceOrigin && !originAllowed(opts.origin ?? null, allowedOrigins)) {
    throw new EmbedAuthError("FORBIDDEN_ORIGIN", "This origin is not allowed for this embed key.");
  }

  const [company] = await db
    .select({ embedEnabled: schema.companyProfiles.embedEnabled })
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.id, row.companyId))
    .limit(1);
  if (!company?.embedEnabled) {
    throw new EmbedAuthError("NOT_ENABLED", "Embedding is disabled for this company.");
  }

  await db
    .update(companyEmbedKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(companyEmbedKeys.id, row.id))
    .catch(() => undefined);

  const scope = await resolveSegmentForCompany(row.companyId);
  return { scope, companyId: row.companyId, scopes, allowedOrigins };
}

/** The company's slug + embed toggle (null when the company is missing). */
export function getCompanyEmbedSettings(companyId: string): Promise<{ slug: string | null; embedEnabled: boolean } | null> {
  return new CompaniesRepository(getDb()).findEmbedSettings(companyId);
}

/** Turn embedding on/off for a company. */
export function setCompanyEmbedEnabled(companyId: string, enabled: boolean): Promise<void> {
  return new CompaniesRepository(getDb()).setEmbedEnabled(companyId, enabled);
}

/**
 * The copyable snippet for a view. The key is a placeholder injected from an
 * env var at build/deploy time — never the real key.
 */
export function buildEmbedSnippet(companySlugOrId: string, view: string): string {
  const base = publicAppBaseUrl();
  return [
    `<!-- hired.video embed — ${view} -->`,
    `<!-- The key is injected at build/deploy time from an environment variable.`,
    `     NEVER hardcode or commit your embed key. -->`,
    `<script`,
    `  src="${base}/embed/v1/loader.js"`,
    `  data-hired-company="${companySlugOrId}"`,
    `  data-hired-view="${view}"`,
    `  data-hired-key="${EMBED_KEY_PLACEHOLDER}"`,
    `  async></script>`,
    `<div data-hired-embed></div>`,
  ].join("\n");
}
