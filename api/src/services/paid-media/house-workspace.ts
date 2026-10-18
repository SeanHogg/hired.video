/**
 * House workspace binding for the SuperAdmin ads page (#986).
 *
 * Surfaces HOUSE_USER_ID and lazily ensures the calling SuperAdmin holds an
 * active studio-scope `workspace_grants` row against the house subject, so
 * canActFor() authorizes the delegated workspace on every later paid-media
 * write. Reuses the existing `delegated` workspace kind — no 4th kind.
 */

import { getDb } from "../../db/index.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import { WorkspaceGrantsRepository } from "../../repositories/workspaceGrantsRepository.js";
import { WorkspaceForbiddenError } from "../studio/workspace.js";

export interface HouseConfig {
  houseUserId: string | null;
  granted: boolean;
}

export async function getHouseWorkspaceConfig(args: {
  actorUserId: string;
  actorIsSuperAdmin: boolean;
  houseUserId: string | null;
}): Promise<HouseConfig> {
  if (!args.actorIsSuperAdmin) {
    throw new WorkspaceForbiddenError("House workspace is SuperAdmin-only.");
  }
  const { houseUserId, actorUserId } = args;
  // Not configured (or not seeded) — the page falls back to its personal
  // workspace behaviour; null is not an error.
  if (!houseUserId) return { houseUserId: null, granted: false };
  const db = getDb();
  const house = await new UsersRepository(db).findById(houseUserId);
  if (!house) return { houseUserId: null, granted: false };
  if (houseUserId !== actorUserId) {
    const grants = new WorkspaceGrantsRepository(db);
    const existing = await grants.findActive(houseUserId, actorUserId, "studio");
    if (!existing) {
      await grants.insertIfAbsent({
        subjectUserId: houseUserId,
        contributorUserId: actorUserId,
        grantedByUserId: actorUserId,
        role: "editor",
        scope: "studio",
        isActive: true,
      });
    }
  }
  return { houseUserId, granted: true };
}
