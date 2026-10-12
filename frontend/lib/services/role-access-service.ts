/**
 * Role Access Service — client for the per-role feature & navigation manifest.
 *
 *   getMine()  — the authenticated viewer's manifest (or a SA-previewed role).
 *   admin*     — SuperAdmin curation: read the registry + overrides, upsert a
 *                delta, reset a role.
 *
 * Wire shape + the resolver come from @shared/role-access so client and server
 * can't drift. The admin read returns the registry + raw overrides; callers
 * resolve each role's manifest with the shared resolveRoleAccess.
 */
import { apiClient } from "../api-client";
import type {
  RoleFeatureAccessRow,
  UpsertRoleAccessInput,
} from "@shared/role-access";
import type { UserRole } from "@shared/user-roles";

export interface RoleAccessAdminPayload {
  overrides: RoleFeatureAccessRow[];
}

export interface RoleAccessMineResponse {
  role: string;
  overrides: RoleFeatureAccessRow[];
}

class RoleAccessService {
  /** The viewer's raw override deltas; the caller resolves them against the
   *  client registry with the shared resolver. `role` is a SA-only preview
   *  override; non-SA callers always get their own role. Returns null on error
   *  so the caller can fail open to registry defaults (menu never empties). */
  async getMine(role?: UserRole | string): Promise<RoleAccessMineResponse | null> {
    try {
      const qs = role ? `?role=${encodeURIComponent(role)}` : "";
      const res = await apiClient.get<RoleAccessMineResponse>(
        `/api/role-access/me${qs}`,
        undefined,
        { suppressErrorEvent: true },
      );
      return res.data ?? null;
    } catch {
      return null;
    }
  }

  async adminGet(): Promise<RoleAccessAdminPayload> {
    const res = await apiClient.get<RoleAccessAdminPayload>("/api/admin/role-access");
    return res.data ?? { overrides: [] };
  }

  async adminUpsert(input: UpsertRoleAccessInput): Promise<void> {
    await apiClient.post("/api/admin/role-access", input);
  }

  async adminReset(role: UserRole | string): Promise<void> {
    await apiClient.delete(`/api/admin/role-access/${encodeURIComponent(role)}`);
  }
}

export const roleAccessService = new RoleAccessService();
