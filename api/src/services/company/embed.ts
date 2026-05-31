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
import { EMBED_KEY_PLACEHOLDER } from "../../../../shared/embed.js";

const { companyEmbedKeys } = schema;

/** Public base URL of the app (the embed loader origin). */
function appBaseUrl(): string {
  return (
    process?.env?.PUBLIC_APP_URL ||
    process?.env?.APP_URL ||
    (globalThis as any).__ENV?.PUBLIC_APP_URL ||
    "https://hired.video"
  ).replace(/\/$/, "");
}

/** hvk_<48 hex chars> — same family as user api keys, longer entropy. */
export async function generateEmbedKey(): Promise<{ key: string; prefix: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const key = `hvk_${hex}`;
  const prefix = key.slice(0, 12);
  const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
}

/** Create a key; the full plaintext key is returned ONCE and never stored. */
export async function createEmbedKey(
  input: CreateEmbedKeyInput,
  db = getDb(),
): Promise<{ key: string; view: EmbedKeyView }> {
  const { key, prefix, hash } = await generateEmbedKey();
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
    })
    .returning();
  return { key, view: toKeyView(row as EmbedKeyRow) };
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

/**
 * The copyable snippet for a view. The key is a placeholder injected from an
 * env var at build/deploy time — never the real key.
 */
export function buildEmbedSnippet(companySlugOrId: string, view: string): string {
  const base = appBaseUrl();
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
