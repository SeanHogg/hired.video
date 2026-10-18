/**
 * SocialConnectionService — owns the three connection layers (PRD §5.0):
 *   Layer 1 (developer app)  → platform-config.isPlatformConfigured (Secrets)
 *   Layer 2 (brand account)  → provider_connections purpose "managed_social", SuperAdmin-connected
 *   Layer 3 (user account)   → provider_connections purpose "social_publish", per Pro user
 *
 * Single home for:
 *   - cached lane-availability resolution (`resolveLaneAvailability`) — the
 *     ONE source the lane chooser self-gates from (DRY), surfaced to the
 *     client via GET /api/social/platforms;
 *   - OAuth connect orchestration (exchange → encrypt → upsert → invalidate);
 *   - token decryption + refresh-on-expiry for the publish layer (Phase 2).
 *
 * Caching: managed-lane readiness is platform-global and slow-changing, so
 * it's read-through cached (getOrSetCached) and invalidated whenever a brand
 * account is connected/disconnected. Per-user self-connection status is
 * cached isolate-locally per (user, company) — no KV write per miss on
 * Workers Free — and invalidated on connect/disconnect.
 */

import type { Repos } from "../../repositories/index.js";
import type {
  SocialConnectionRow,
  ManagedAccountRow,
  SocialTokenPatch,
} from "../../repositories/socialConnectionRepository.js";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_META,
  type SocialPlatform,
  type SocialLane,
  type PlatformLaneAvailability,
  type ManagedLaneState,
  type SelfLaneState,
} from "../../../../shared/social-platforms.js";
import { isPlatformConfigured, socialPlatformConfig } from "./platform-config.js";
import { missingScopes } from "../oauth/oauth2Provider.js";
import {
  buildSocialAuthUrl,
  exchangeSocialCode,
  fetchSocialIdentity,
  refreshSocialToken,
  verifyState,
  type SocialOAuthState,
} from "./social-oauth.js";
import {
  connectionEncryptionConfigured,
  openAndResealSecret,
  sealConnectionSecret,
} from "../provider-connections/connection-secrets.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import { getOrSetIsolateCached, invalidateIsolateKey } from "../../utils/isolate-cache.js";
import { DomainError } from "../../domains/errors.js";

/** CREDENTIALS_KMS_KEY seals every connection secret (connection-secrets.ts).
 *  The pre-merge SOCIAL_KMS_KEY / PAID_MEDIA_KMS_KEY are only read (via
 *  getEnv) to open tokens not yet re-sealed. */
export type SocialEnv = { CREDENTIALS_KMS_KEY?: string; SOCIAL_KMS_KEY?: string; PAID_MEDIA_KMS_KEY?: string };

const MANAGED_READY_TTL = 300;       // brand-account presence changes rarely
const SELF_STATUS_TTL = 120;         // per-user connection set

function managedReadyKey(): string {
  return "social:managed-ready:v1";
}
function selfStatusKey(userId: string, companyId: string | null): string {
  return `social:self-status:v1:${userId}:${companyId ?? "_"}`;
}

/** NOT_CONFIGURED → 503; every other code → 400. */
export class SocialConnectionError extends DomainError {
  constructor(code: string, message: string) {
    super(code === "NOT_CONFIGURED" ? 503 : 400, code, message);
    this.name = "SocialConnectionError";
  }
}

function isExpired(row: { accessTokenExpiresAt: Date | null; status: string }): boolean {
  if (row.status !== "active") return true;
  if (!row.accessTokenExpiresAt) return false; // no expiry info → assume valid
  return new Date(row.accessTokenExpiresAt).getTime() <= Date.now() + 60_000; // 60s skew
}

export class SocialConnectionService {
  constructor(
    private readonly repos: Repos,
    private readonly env: SocialEnv,
  ) {}

  // ── Discovery / lane availability ──────────────────────────────────────

  /** Which platforms have a connected brand account (Layer 2). Cached. */
  private async managedReadyPlatforms(): Promise<Set<SocialPlatform>> {
    const ids = await getOrSetCached<string[]>({
      key: managedReadyKey(),
      ttlSeconds: MANAGED_READY_TTL,
      loader: async () => {
        const rows = await this.repos.socialConnections.listManaged();
        return rows.filter((r) => r.status === "active").map((r) => r.platform);
      },
    });
    return new Set(ids.filter((p): p is SocialPlatform => p in SOCIAL_PLATFORM_META));
  }

  /** Which platforms the user has a fresh self-connection for (Layer 3). Cached. */
  private async selfConnectedPlatforms(userId: string, companyId: string | null): Promise<Set<SocialPlatform>> {
    const ids = await getOrSetIsolateCached<string[]>({
      key: selfStatusKey(userId, companyId),
      ttlSeconds: SELF_STATUS_TTL,
      loader: async () => {
        const rows = await this.repos.socialConnections.listForOwner(userId, companyId);
        return rows.filter((r) => r.status === "active").map((r) => r.platform);
      },
    });
    return new Set(ids.filter((p): p is SocialPlatform => p in SOCIAL_PLATFORM_META));
  }

  /** Layer 1 is usable only when the developer app is configured AND the
   *  token store can encrypt — otherwise consent would succeed and the
   *  callback would have nowhere to put the tokens. */
  private canConnect(platform: SocialPlatform): boolean {
    return isPlatformConfigured(platform) && this.encryptionConfigured();
  }

  private encryptionConfigured(): boolean {
    return this.env.CREDENTIALS_KMS_KEY ? true : connectionEncryptionConfigured();
  }

  private managedState(platform: SocialPlatform, ready: Set<SocialPlatform>): ManagedLaneState {
    const meta = SOCIAL_PLATFORM_META[platform];
    if (!meta.supportsManagedLane) return "unsupported";
    if (!this.canConnect(platform)) return "not_configured"; // Layer 1 missing
    return ready.has(platform) ? "ready" : "not_connected";       // Layer 2 missing
  }

  /** Self lane needs no plan: how many channels one post may reach is the
   *  plan's channel cap, enforced at publish time (post-channel-gate.ts). */
  private selfState(platform: SocialPlatform, connected: Set<SocialPlatform>): SelfLaneState {
    const meta = SOCIAL_PLATFORM_META[platform];
    if (!meta.supportsSelfLane) return "unsupported";
    if (!this.canConnect(platform)) return "not_configured"; // Layer 1 missing
    return connected.has(platform) ? "available" : "needs_connection";
  }

  /**
   * The lane-availability matrix — the SSoT the Post dock, the connections
   * list and `useSocialPublishEntitlement` render from. `userId` null = a
   * signed-out visitor: platform availability only, nothing connected.
   */
  async resolveLaneAvailability(opts: {
    userId: string | null;
    companyId: string | null;
  }): Promise<PlatformLaneAvailability[]> {
    const [ready, connected] = await Promise.all([
      this.managedReadyPlatforms(),
      opts.userId
        ? this.selfConnectedPlatforms(opts.userId, opts.companyId)
        : Promise.resolve(new Set<SocialPlatform>()),
    ]);

    return SOCIAL_PLATFORMS.map((platform) => ({
      platform,
      managed: this.managedState(platform, ready),
      self: this.selfState(platform, connected),
      selfConnected: connected.has(platform),
    }));
  }

  /** Whether hired.video's brand account for `platform` is connected and
   *  active (Lane A live). Served from the cached ready-set. */
  async isManagedLaneReady(platform: SocialPlatform): Promise<boolean> {
    return (await this.managedReadyPlatforms()).has(platform);
  }

  /** Platform-global managed-lane readiness (no user) — for SA status board. */
  async managedStatusBoard(): Promise<Array<{ platform: SocialPlatform; configured: boolean; managed: ManagedLaneState; account: { handle: string | null; status: string; expiresAt: Date | null } | null }>> {
    const rows = await this.repos.socialConnections.listManaged();
    const byPlatform = new Map(rows.map((r) => [r.platform, r]));
    const ready = new Set(rows.filter((r) => r.status === "active").map((r) => r.platform));
    return SOCIAL_PLATFORMS.map((platform) => {
      const acct = byPlatform.get(platform);
      return {
        platform,
        configured: this.canConnect(platform),
        managed: this.managedState(platform, ready as Set<SocialPlatform>),
        account: acct
          ? { handle: acct.handle, status: acct.status, expiresAt: acct.accessTokenExpiresAt }
          : null,
      };
    });
  }

  /** User's own connections, for the /settings/connections list. */
  async listUserConnections(userId: string, companyId: string | null): Promise<Array<Pick<SocialConnectionRow, "platform" | "handle" | "avatarUrl" | "status" | "accessTokenExpiresAt">>> {
    const rows = await this.repos.socialConnections.listForOwner(userId, companyId);
    return rows.map((r) => ({
      platform: r.platform,
      handle: r.handle,
      avatarUrl: r.avatarUrl,
      status: r.status,
      accessTokenExpiresAt: r.accessTokenExpiresAt,
    }));
  }

  // ── OAuth: build authorize URL ─────────────────────────────────────────

  async buildAuthUrl(opts: {
    platform: SocialPlatform;
    lane: SocialLane;
    scope: "self" | "managed";
    userId: string;
    companyId: string | null;
    redirectTo: string;
  }): Promise<string> {
    if (!isPlatformConfigured(opts.platform)) {
      throw new SocialConnectionError("NOT_CONFIGURED", `${opts.platform} developer app is not configured`);
    }
    if (!this.encryptionConfigured()) {
      throw new SocialConnectionError("NOT_CONFIGURED", "social token encryption key is not configured");
    }
    return buildSocialAuthUrl(opts);
  }

  // ── OAuth: complete callback ───────────────────────────────────────────

  /** Verify the signed state FIRST, on its own, so the callback route knows
   *  where to send the browser even when the exchange then fails. */
  verifyCallbackState(rawState: string): Promise<SocialOAuthState | null> {
    return verifyState(rawState);
  }

  /** Exchange code, encrypt + persist, invalidate caches, for an already
   *  verified state. Returns the connected handle (null if unknown). */
  async completeCallback(state: SocialOAuthState, code: string): Promise<{ handle: string | null }> {
    const tokens = await exchangeSocialCode(state, code);

    // Granular consent (Google) can return a token for a subset of the
    // requested scopes — never persist a connection that can't post.
    const required = socialPlatformConfig(state.platform).requiredScopes ?? [];
    if (missingScopes(tokens.scopes ?? "", required).length > 0) {
      throw new SocialConnectionError("SCOPES_NOT_GRANTED", "scopes_not_granted");
    }

    let identity: { externalId: string; handle: string; avatarUrl?: string } | null = null;
    try {
      identity = await fetchSocialIdentity(state.platform, tokens.accessToken);
    } catch {
      identity = null; // identity fetch is best-effort; connection still persists
    }

    const accessTokenEnc = (await sealConnectionSecret(tokens.accessToken, this.sealOptions())) ?? "";
    const refreshTokenEnc = await sealConnectionSecret(tokens.refreshToken, this.sealOptions());
    const expiresAt = tokens.expiresInSec ? new Date(Date.now() + tokens.expiresInSec * 1000) : null;

    if (state.scope === "managed") {
      await this.repos.socialConnections.upsertManaged({
        platform: state.platform,
        externalAccountId: identity?.externalId ?? null,
        handle: identity?.handle ?? null,
        avatarUrl: identity?.avatarUrl ?? null,
        accessTokenEnc,
        refreshTokenEnc,
        accessTokenExpiresAt: expiresAt,
        scopes: tokens.scopes ?? "",
        connectedByUserId: state.userId,
      });
      invalidateCachedKey(managedReadyKey());
    } else {
      await this.repos.socialConnections.upsertConnection({
        userId: state.userId,
        companyId: state.companyId,
        platform: state.platform,
        externalAccountId: identity?.externalId ?? null,
        handle: identity?.handle ?? null,
        avatarUrl: identity?.avatarUrl ?? null,
        accessTokenEnc,
        refreshTokenEnc,
        accessTokenExpiresAt: expiresAt,
        scopes: tokens.scopes ?? "",
      });
      invalidateIsolateKey(selfStatusKey(state.userId, state.companyId));
    }

    return { handle: identity?.handle ?? null };
  }

  // ── Disconnect ─────────────────────────────────────────────────────────

  async disconnectSelf(userId: string, companyId: string | null, platform: SocialPlatform): Promise<boolean> {
    const removed = await this.repos.socialConnections.removeConnection(userId, companyId, platform);
    invalidateIsolateKey(selfStatusKey(userId, companyId));
    return removed;
  }

  async disconnectManaged(platform: SocialPlatform): Promise<boolean> {
    const removed = await this.repos.socialConnections.removeManaged(platform);
    invalidateCachedKey(managedReadyKey());
    return removed;
  }

  // ── Token access for the publish layer (Phase 2) ───────────────────────

  /**
   * Decrypted, fresh access token for a self connection — refreshing +
   * persisting if expired. Returns null if no usable connection exists
   * (caller surfaces ACCOUNT_NOT_CONNECTED). Token decryption never leaves
   * this service.
   */
  async getFreshSelfAccessToken(userId: string, companyId: string | null, platform: SocialPlatform): Promise<string | null> {
    const row = await this.repos.socialConnections.findForOwner(userId, companyId, platform);
    if (!row) return null;
    return this.freshAccessToken(row, (patch) => this.repos.socialConnections.updateTokens(row.id, patch), () => invalidateIsolateKey(selfStatusKey(userId, companyId)));
  }

  /** Decrypted, fresh access token for the brand account (Lane A). */
  async getFreshManagedAccessToken(platform: SocialPlatform): Promise<string | null> {
    const row = await this.repos.socialConnections.findManaged(platform);
    if (!row) return null;
    return this.freshAccessToken(row, (patch) => this.repos.socialConnections.updateManagedTokens(row.id, patch), () => invalidateCachedKey(managedReadyKey()));
  }

  private sealOptions() {
    return this.env.CREDENTIALS_KMS_KEY ? { masterKey: this.env.CREDENTIALS_KMS_KEY } : {};
  }

  /** Decrypt one stored token, re-sealing a legacy-encrypted value. */
  private openToken(rowId: string, column: "accessTokenEnc" | "refreshTokenEnc", stored: string | null): Promise<string | null> {
    return openAndResealSecret(stored, (resealed) =>
      this.repos.socialConnections.resealSecret(rowId, column, stored as string, resealed),
    );
  }

  private async freshAccessToken(
    row: SocialConnectionRow | ManagedAccountRow,
    persist: (patch: SocialTokenPatch) => Promise<void>,
    invalidate: () => void,
  ): Promise<string | null> {
    if (!isExpired(row)) {
      return this.openToken(row.id, "accessTokenEnc", row.accessTokenEnc);
    }
    // Expired — refresh if we have a refresh token.
    if (!row.refreshTokenEnc) return null;
    const refreshToken = await this.openToken(row.id, "refreshTokenEnc", row.refreshTokenEnc);
    if (!refreshToken) return null;
    const refreshed = await refreshSocialToken(row.platform as SocialPlatform, refreshToken);
    if (!refreshed) {
      await persist({ accessTokenEnc: row.accessTokenEnc, refreshTokenEnc: row.refreshTokenEnc, accessTokenExpiresAt: row.accessTokenExpiresAt, status: "expired" });
      invalidate();
      return null;
    }
    const accessTokenEnc = (await sealConnectionSecret(refreshed.accessToken, this.sealOptions())) ?? "";
    const refreshTokenEnc = refreshed.refreshToken
      ? await sealConnectionSecret(refreshed.refreshToken, this.sealOptions())
      : row.refreshTokenEnc;
    const accessTokenExpiresAt = refreshed.expiresInSec ? new Date(Date.now() + refreshed.expiresInSec * 1000) : null;
    await persist({ accessTokenEnc, refreshTokenEnc, accessTokenExpiresAt, status: "active" });
    invalidate();
    return refreshed.accessToken;
  }
}
