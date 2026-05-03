// workspace.ts — Studio workspace context + ownership gating.
//
// "Workspace" is the lens the user is acting through in Studio: personal
// (companyId = null) or a company they're a member of (companyId set).
// Every studio mutation routes through this module so the auth rule lives
// in exactly one place. Reads use buildOwnershipFilter() which returns a
// single OR predicate covering "rows I own personally" plus "rows in
// companies I'm a member of".
//
// Membership questions are delegated to services/company/scope.ts — the
// same userCanAccessCompany / getUserCompanyIds used by the recruiting
// platform and lists. No re-implementation here.

import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  getUserCompanyIds,
  userCanAccessCompany,
  type CompanyScopeDeps,
} from "../company/scope.js";

export type DbHandle = ReturnType<typeof getDb>;

/** Caller-supplied workspace selection. `null`/`undefined` = personal. */
export type WorkspaceSelection = string | null | undefined;

export interface WorkspaceContext {
  userId: string;
  companyId: string | null;
}

export class WorkspaceForbiddenError extends Error {
  readonly code = "WORKSPACE_FORBIDDEN" as const;
  constructor(message = "Not a member of this company workspace.") {
    super(message);
    this.name = "WorkspaceForbiddenError";
  }
}

const defaultDeps = (): CompanyScopeDeps => ({ db: getDb() });

// ─── Write-side gate ────────────────────────────────────────────────────────

/** Resolves a client-supplied selection into a verified WorkspaceContext.
 *  Throws WorkspaceForbiddenError when the caller picks a company they're
 *  not a member of. Personal selections are always allowed (the row-level
 *  user_id check guards them at the DB layer). */
export async function resolveWorkspaceForWrite(
  userId: string,
  companyId: WorkspaceSelection,
  deps: CompanyScopeDeps = defaultDeps(),
): Promise<WorkspaceContext> {
  if (!companyId) return { userId, companyId: null };
  const ok = await userCanAccessCompany(userId, companyId, deps);
  if (!ok) throw new WorkspaceForbiddenError();
  return { userId, companyId };
}

/** Throwing variant used when you've already loaded a row and want to
 *  gate on its companyId field (PATCH/DELETE on existing project, etc). */
export async function assertCompanyEditor(
  userId: string,
  companyId: string | null,
  deps: CompanyScopeDeps = defaultDeps(),
): Promise<void> {
  if (companyId == null) return;
  const ok = await userCanAccessCompany(userId, companyId, deps);
  if (!ok) throw new WorkspaceForbiddenError();
}

// ─── Read-side filter ───────────────────────────────────────────────────────

export async function listAccessibleWorkspaces(
  userId: string,
  deps: CompanyScopeDeps = defaultDeps(),
): Promise<{ companyIds: string[] }> {
  const companyIds = await getUserCompanyIds(userId, deps);
  return { companyIds };
}

/** Builds a Drizzle WHERE predicate covering every row the user can read:
 *
 *    user_id = :userId                          -- personal rows
 *    OR company_id IN :companyIds               -- company rows
 *
 *  Both columns must live on the same table reference.
 *
 *  When `restrictToCompanyId` is set, the predicate narrows to that single
 *  workspace (caller must verify membership first via assertCompanyEditor).
 *  When `restrictToCompanyId === null`, narrows to personal-only rows. */
export function buildOwnershipFilter(args: {
  userIdColumn: any;
  companyIdColumn: any;
  userId: string;
  companyIds: string[];
  restrictToCompanyId?: string | null;
}): SQL | undefined {
  const { userIdColumn, companyIdColumn, userId, companyIds, restrictToCompanyId } = args;

  if (restrictToCompanyId === null) {
    return and(eq(userIdColumn, userId), isNull(companyIdColumn));
  }
  if (restrictToCompanyId) {
    return eq(companyIdColumn, restrictToCompanyId);
  }
  if (companyIds.length === 0) return eq(userIdColumn, userId);
  return or(eq(userIdColumn, userId), inArray(companyIdColumn, companyIds));
}

/** One-shot helper for routes: vet the workspace selection AND fetch the
 *  accessible-company list (for the read filter) in parallel. */
export async function resolveStudioContext(
  userId: string,
  selectedCompanyId: WorkspaceSelection,
  deps: CompanyScopeDeps = defaultDeps(),
): Promise<{
  context: WorkspaceContext;
  accessibleCompanyIds: string[];
}> {
  const [context, accessibleCompanyIds] = await Promise.all([
    resolveWorkspaceForWrite(userId, selectedCompanyId, deps),
    getUserCompanyIds(userId, deps),
  ]);
  return { context, accessibleCompanyIds };
}

export { userCanAccessCompany, getUserCompanyIds };
