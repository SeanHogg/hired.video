/**
 * SocialConnectionService — owns the three connection layers (PRD §5.0):
 *   Layer 1 (developer app)  → platform-config.isPlatformConfigured (Secrets)
 *   Layer 2 (brand account)  → managed_accounts, SuperAdmin-connected
 *   Layer 3 (user account)   → social_connections, per Pro user
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
 * cached per (user, company) and invalidated on connect/disconnect.
 */

import type { Repos } from "../../repositories/index.js";
import type { SocialConnectionRow, ManagedAccountRow } from "../../db/schema/social.js";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_META,
  type SocialPlatform,
  type SocialLane,
  type PlatformLaneAvailability,
  type ManagedLaneState,
  type SelfLaneState,
} from "../../../../shared/social-platforms.js";
import { isPlatformConfigured } from "./platform-config.js";
import {
  buildSocialAuthUrl,
  exchangeSocialCode,
  fetchSocialIdentity,
  refreshSocialToken,
  verifyState,
  type SocialOAuthState,
} from "./social-oauth.js";
import { encryptSocialSecret, decryptSocialSecret } from "./secrets.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import { getSubscription } from "../billing/BillingService.js";

type SocialEnv = { SOCIAL_KMS_KEY?: string; PAID_MEDIA_KMS_KEY?: string };

const MANAGED_READY_TTL = 300;       // brand-account presence changes rarely
const SELF_STATUS_TTL = 120;         // per-user connection set

function managedReadyKey(): string {
  return "social:managed-ready:v1";
}
function selfStatusKey(userId: string, companyId: string | null): string {
  return `social:self-status:v1:${userId}:${companyId ?? "_"}`;
}

export class SocialConnectionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
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
    const ids = await getOrSetCached<string[]>({
      key: selfStatusKey(userId, companyId),
      ttlSeconds: SELF_STATUS_TTL,
      loader: async () => {
        const rows = await this.repos.socialConnections.listForOwner(userId, companyId);
        return rows.filter((r) => r.status === "active").map((r) => r.platform);
      },
    });
    return new Set(ids.filter((p): p is SocialPlatform => p in SOCIAL_PLATFORM_META));
  }

  private managedState(platform: SocialPlatform, ready: Set<SocialPlatform>): ManagedLaneState {
    const meta = SOCIAL_PLATFORM_META[platform];
    if (!meta.supportsManagedLane) return "unsupported";
    if (!isPlatformConfigured(platform)) return "not_configured"; // Layer 1 missing
    return ready.has(platform) ? "ready" : "not_connected";       // Layer 2 missing
  }

  private selfState(
    platform: SocialPlatform,
    isPro: boolean,
    connected: Set<SocialPlatform>,
  ): SelfLaneState {
    const meta = SOCIAL_PLATFORM_META[platform];
    if (!meta.supportsSelfLane) return "unsupported";
    if (!isPro) return "needs_pro";
    return connected.has(platform) ? "available" : "needs_connection";
  }

  /**
   * The lane-availability matrix for a user — the SSoT the lane chooser and
   * `useSocialPublishEntitlement` render from. SuperAdmins/admins are treated
   * as entitled for the self lane (mirrors requirePro's bypass).
   */
  async resolveLaneAvailability(opts: {
    userId: string;
    companyId: string | null;
    isPrivileged: boolean;
  }): Promise<PlatformLaneAvailability[]> {
    const [ready, connected, sub] = await Promise.all([
      this.managedReadyPlatforms(),
      this.selfConnectedPlatforms(opts.userId, opts.companyId),
      opts.isPrivileged ? Promise.resolve({ isPro: true }) : getSubscription(opts.userId),
    ]);
    const isPro = opts.isPrivileged || sub.isPro;

    return SOCIAL_PLATFORMS.map((platform) => ({
      platform,
      managed: this.managedState(platform, ready),
      self: this.selfState(platform, isPro, connected),
      selfConnected: connected.has(platform),
    }));
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
        configured: isPlatformConfigured(platform),
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
    return buildSocialAuthUrl(opts);
  }

  // ── OAuth: complete callback ───────────────────────────────────────────

  /** Verify state, exchange code, encrypt + persist, invalidate caches.
   *  Returns the verified state so the route can redirect appropriately. */
  async completeCallback(rawState: string, code: string): Promise<{ state: SocialOAuthState; handle: string | null }> {
    const state = await verifyState(rawState);
    if (!state) throw new SocialConnectionError("INVALID_STATE", "OAuth state invalid or expired");

    const tokens = await exchangeSocialCode(state, code);

    let identity: { externalId: string; handle: string; avatarUrl?: string } | null = null;
    try {
      identity = await fetchSocialIdentity(state.platform, tokens.accessToken);
    } catch {
      identity = null; // identity fetch is best-effort; connection still persists
    }

    const accessTokenEnc = await encryptSocialSecret(this.env, tokens.accessToken);
    const refreshTokenEnc = tokens.refreshToken ? await encryptSocialSecret(this.env, tokens.refreshToken) : null;
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
      invalidateCachedKey(selfStatusKey(state.userId, state.companyId));
    }

    return { state, handle: identity?.handle ?? null };
  }

  // ── Disconnect ─────────────────────────────────────────────────────────

  async disconnectSelf(userId: string, companyId: string | null, platform: SocialPlatform): Promise<boolean> {
    const removed = await this.repos.socialConnections.removeConnection(userId, companyId, platform);
    invalidateCachedKey(selfStatusKey(userId, companyId));
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
    return this.freshAccessToken(row, (patch) => this.repos.socialConnections.updateTokens(row.id, patch), () => invalidateCachedKey(selfStatusKey(userId, companyId)));
  }

  /** Decrypted, fresh access token for the brand account (Lane A). */
  async getFreshManagedAccessToken(platform: SocialPlatform): Promise<string | null> {
    const row = await this.repos.socialConnections.findManaged(platform);
    if (!row) return null;
    return this.freshAccessToken(row, (patch) => this.repos.socialConnections.updateManagedTokens(row.id, patch), () => invalidateCachedKey(managedReadyKey()));
  }

  private async freshAccessToken(
    row: SocialConnectionRow | ManagedAccountRow,
    persist: (patch: { accessTokenEnc: string; refreshTokenEnc: string | null; accessTokenExpiresAt: Date | null; status?: string }) => Promise<void>,
    invalidate: () => void,
  ): Promise<string | null> {
    if (!isExpired(row)) {
      return decryptSocialSecret(this.env, row.accessTokenEnc);
    }
    // Expired — refresh if we have a refresh token.
    if (!row.refreshTokenEnc) return null;
    const refreshToken = await decryptSocialSecret(this.env, row.refreshTokenEnc);
    const refreshed = await refreshSocialToken(row.platform as SocialPlatform, refreshToken);
    if (!refreshed) {
      await persist({ accessTokenEnc: row.accessTokenEnc, refreshTokenEnc: row.refreshTokenEnc, accessTokenExpiresAt: row.accessTokenExpiresAt, status: "expired" });
      invalidate();
      return null;
    }
    const accessTokenEnc = await encryptSocialSecret(this.env, refreshed.accessToken);
    const refreshTokenEnc = refreshed.refreshToken ? await encryptSocialSecret(this.env, refreshed.refreshToken) : row.refreshTokenEnc;
    const accessTokenExpiresAt = refreshed.expiresInSec ? new Date(Date.now() + refreshed.expiresInSec * 1000) : null;
    await persist({ accessTokenEnc, refreshTokenEnc, accessTokenExpiresAt, status: "active" });
    invalidate();
    return refreshed.accessToken;
  }
}
