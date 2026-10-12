/**
 * Who may manage a chapter, video form, thumbnail, review link or review
 * comment row (#1586): anyone who
 * may act on the row's PROJECT — owner, company member or delegate
 * (canActFor) — not only the user who created the row. Unknown, malformed
 * and forbidden rows all resolve to null, so the routes answer 404 and a
 * row's existence never leaks.
 */
import { getDb } from "../../db/index.js";
import {
  findEngagementRowProject,
  type EngagementRowKind,
  type EngagementRowProject,
} from "../../repositories/studioEngagementRowRepository.js";
import { canActFor } from "./workspace.js";

export type { EngagementRowKind } from "../../repositories/studioEngagementRowRepository.js";

/** Port so the rule is testable with fixtures. */
export interface EngagementRowAccessSource {
  findRowProject(kind: EngagementRowKind, rowId: string): Promise<EngagementRowProject | null>;
  canActFor(actor: string, ownerUserId: string, ownerCompanyId: string | null): Promise<boolean>;
}

function dbSource(): EngagementRowAccessSource {
  const db = getDb();
  return {
    findRowProject: (kind, rowId) => findEngagementRowProject(db, kind, rowId),
    canActFor: (actor, ownerUserId, ownerCompanyId) => canActFor(actor, ownerUserId, ownerCompanyId, { db }),
  };
}

/** The row's project id when `actor` may act on it, else null. */
export async function resolveActableEngagementRow(
  actor: string | undefined,
  kind: EngagementRowKind,
  rowId: string,
  source: EngagementRowAccessSource = dbSource(),
): Promise<{ projectId: string } | null> {
  if (!actor) return null;
  const row = await source.findRowProject(kind, rowId);
  if (!row) return null;
  const allowed = await source.canActFor(actor, row.ownerUserId, row.ownerCompanyId);
  return allowed ? { projectId: row.projectId } : null;
}
