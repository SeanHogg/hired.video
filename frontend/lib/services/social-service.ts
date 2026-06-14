/**
 * Social publishing connection layer — client. Wraps /api/social/* (Lane B +
 * discovery) and /api/admin/social/* (SuperAdmin managed brand accounts).
 * The publish layer itself is Phase 2; this covers the three connection
 * layers (PRD §5.0).
 */
import { apiClient } from "@/lib/api-client";
import type {
  SocialPlatform,
  SocialPlatformMeta,
  ManagedLaneState,
  SelfLaneState,
} from "@shared/social-platforms";

/** A platform row as returned by GET /api/social/platforms — static meta +
 *  the per-user lane availability resolved server-side (the SSoT the lane
 *  chooser self-gates from). */
export interface PlatformAvailability extends SocialPlatformMeta {
  managed: ManagedLaneState;
  self: SelfLaneState;
  selfConnected: boolean;
}

export interface UserConnection {
  platform: SocialPlatform;
  handle: string | null;
  avatarUrl: string | null;
  status: string;
  accessTokenExpiresAt: string | null;
}

/** A platform row from GET /api/admin/social/managed (SA status board). */
export interface ManagedPlatformStatus extends SocialPlatformMeta {
  configured: boolean;            // layer 1 — developer app secret present
  managed: ManagedLaneState;      // resolved lane-A state
  account: { handle: string | null; status: string; expiresAt: string | null } | null;
}

export const socialService = {
  // ── Discovery + Lane B (user) ─────────────────────────────────────────
  async listPlatforms(): Promise<PlatformAvailability[]> {
    const res = await apiClient.get<{ platforms: PlatformAvailability[] }>("/api/social/platforms");
    return res.data?.platforms ?? [];
  },

  async listConnections(): Promise<UserConnection[]> {
    const res = await apiClient.get<{ connections: UserConnection[] }>("/api/social/connections");
    return res.data?.connections ?? [];
  },

  /** Returns the platform's authorize URL — the caller navigates the browser to it. */
  async getAuthUrl(platform: SocialPlatform): Promise<string> {
    const redirectTo = `${window.location.origin}/settings/connections`;
    const res = await apiClient.get<{ url: string }>(
      `/api/social/${platform}/auth-url?redirectTo=${encodeURIComponent(redirectTo)}`,
    );
    return res.data.url;
  },

  async disconnect(platform: SocialPlatform): Promise<void> {
    await apiClient.post(`/api/social/${platform}/disconnect`, {});
  },

  // ── Lane A (SuperAdmin managed brand accounts) ────────────────────────
  async listManaged(): Promise<ManagedPlatformStatus[]> {
    const res = await apiClient.get<{ platforms: ManagedPlatformStatus[] }>("/api/admin/social/managed");
    return res.data?.platforms ?? [];
  },

  async getManagedAuthUrl(platform: SocialPlatform): Promise<string> {
    const res = await apiClient.get<{ url: string }>(`/api/admin/social/${platform}/auth-url`);
    return res.data.url;
  },

  async disconnectManaged(platform: SocialPlatform): Promise<void> {
    await apiClient.post(`/api/admin/social/${platform}/disconnect`, {});
  },
};
