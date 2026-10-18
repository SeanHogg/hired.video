/**
 * Per-platform OAuth flow orchestration. Shared across all 5 adapters
 * via the PaidMediaAdapter interface.
 *
 * Flow:
 *   1. UI calls /api/paid-media/oauth/start?platform=meta&workspace=...
 *   2. We mint a signed `state` JWT carrying { userId, workspace, platform, nonce }
 *      and redirect the browser to adapter.buildAuthUrl(state).
 *   3. Platform redirects back to /api/paid-media/oauth/callback?state=...&code=...
 *   4. We verify state, exchange code for tokens via adapter.exchangeAuthCode,
 *      seal + persist into provider_connections (purpose "ads", via the
 *      ad-connections adapter), then list ad accounts
 *      via adapter.listAdAccounts and seed paid_media_accounts.
 *
 * The state JWT replaces session storage — Cloudflare Workers are
 * stateless, and the callback must work even after the consent screen
 * dropped any cookies (especially in Safari).
 */

import { SignJWT, jwtVerify } from "jose";
import { getDb, schema } from "../../db/index.js";
import { AdConnections } from "../provider-connections/ad-connections.js";
import { getAdapter, assertPlatform, type PaidMediaEnv } from "./ports/registry.js";
import { resolveWorkspaceForWrite, type WorkspaceSelection } from "../studio/workspace.js";
import type { PaidMediaPlatform } from "../../db/schema/paidmedia.js";

type DbHandle = ReturnType<typeof getDb>;

const STATE_TTL_SECONDS = 15 * 60;
const STATE_ISSUER = "hired.video/paid-media";

export interface OAuthStateClaims {
  userId:     string;
  platform:   PaidMediaPlatform;
  /** "personal" | "company:<id>" | "delegated:<userId>" */
  workspace:  string;
  redirectTo?: string;
}

function jwtSecret(env: { JWT_SECRET?: string }): Uint8Array {
  if (!env.JWT_SECRET) throw new Error("JWT_SECRET not configured");
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function signOAuthState(env: { JWT_SECRET?: string }, claims: OAuthStateClaims): Promise<string> {
  return new SignJWT(claims as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(STATE_ISSUER)
    .setExpirationTime(`${STATE_TTL_SECONDS}s`)
    .setIssuedAt()
    .sign(jwtSecret(env));
}

export async function verifyOAuthState(env: { JWT_SECRET?: string }, state: string): Promise<OAuthStateClaims> {
  const { payload } = await jwtVerify(state, jwtSecret(env), { issuer: STATE_ISSUER });
  return payload as unknown as OAuthStateClaims;
}

export function parseWorkspaceParam(s: string): WorkspaceSelection {
  if (!s || s === "personal") return { kind: "personal" };
  if (s.startsWith("company:"))   return { kind: "company",   companyId:     s.slice("company:".length) };
  if (s.startsWith("delegated:")) return { kind: "delegated", subjectUserId: s.slice("delegated:".length) };
  return { kind: "personal" };
}

export function serializeWorkspace(selection: WorkspaceSelection): string {
  if (!selection || selection.kind === "personal") return "personal";
  if (selection.kind === "company")   return `company:${selection.companyId}`;
  if (selection.kind === "delegated") return `delegated:${selection.subjectUserId}`;
  return "personal";
}

export interface CompleteOAuthDeps {
  db?: DbHandle;
  env: PaidMediaEnv & { JWT_SECRET?: string };
}

export interface CompleteOAuthResult {
  connectionId: string;
  platform: PaidMediaPlatform;
  accountCount: number;
}

/** Exchange the code for tokens, encrypt, persist a connection,
 *  and seed paid_media_accounts. Returns the connection id. */
export async function completeOAuth(
  deps: CompleteOAuthDeps,
  args: { state: string; code: string; redirectUri: string },
): Promise<CompleteOAuthResult> {
  const d = deps.db ?? getDb();
  const claims = await verifyOAuthState(deps.env, args.state);
  assertPlatform(claims.platform);
  const adapter = getAdapter(deps.env, claims.platform);
  const tokens = await adapter.exchangeAuthCode(args.code, args.redirectUri);

  const ws = parseWorkspaceParam(claims.workspace);
  const ctx = await resolveWorkspaceForWrite(claims.userId, ws, { db: d });

  // Upsert connection — one per (workspace, platform).
  const adConnections = new AdConnections(d);
  const connectionId = await adConnections.saveOAuth(
    { userId: ctx.ownerUserId, companyId: ctx.ownerCompanyId ?? null },
    claims.platform,
    tokens,
  );

  // Discover and seed ad accounts.
  let accountCount = 0;
  try {
    const accounts = await adapter.listAdAccounts(tokens.accessToken);
    for (const a of accounts) {
      await d.insert(schema.paidMediaAccounts).values({
        connectionId,
        userId:            ctx.ownerUserId,
        companyId:         ctx.ownerCompanyId,
        platform:          claims.platform,
        externalAccountId: a.externalAccountId,
        name:              a.name,
        currencyCode:      a.currencyCode,
        timeZone:          a.timeZone,
        metadata:          a.metadata ?? {},
      } as any).onConflictDoNothing();
      accountCount++;
    }
  } catch (err) {
    // Account listing failed — connection still persisted; surface a
    // soft error so user sees "Connected, but no accounts discovered".
    await adConnections.setLastError(connectionId, err instanceof Error ? err.message : String(err));
  }

  return { connectionId, platform: claims.platform, accountCount };
}
