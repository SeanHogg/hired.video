// workspace.ts — Studio workspace context + ownership gating.
//
// "Workspace" = the lens an actor is acting through in Studio. An asset
// has an OWNER (subject) and is mutated by an ACTOR (current user). Three
// owner kinds are supported:
//
//   * Personal user (companyId = null, userId = subject)
//   * Company       (companyId set,  userId = whoever happens to be editing)
//   * Delegated     (a job seeker who granted this actor edit rights via
//                    workspace_grants — the seeker is the subject, the
//                    actor edits on their behalf)
//
// Auth rule (single source of truth — every studio mutation routes here):
//   actor === owner.userId                                           -> yes
//   owner.companyId set AND actor in userCompanyRoleAssociations     -> yes
//   owner.userId !== actor AND active workspace_grants row matches   -> yes
//   otherwise                                                        -> WorkspaceForbiddenError
//
// Reads use buildOwnershipFilter() which emits the OR predicate
// covering personal + company + delegated rows in one shot.
//
// Membership questions (company side) delegate to services/company/scope.ts.

import { and, eq, inArray, isNull, isNotNull, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import {
  getUserCompanyIds,
  userCanAccessCompany,
  type CompanyScopeDeps,
} from "../company/scope.js";
import { DomainError } from "../../domains/errors.js";

export type DbHandle = ReturnType<typeof getDb>;

/** Caller-supplied workspace selection from the client. */
export type WorkspaceSelection =
  | { kind: "personal" }
  | { kind: "company"; companyId: string }
  | { kind: "delegated"; subjectUserId: string }
  | null
  | undefined;

/** Resolved owner of a row being written. user_id is always the actor
 *  (the editor / last-actor); company_id is null for personal/delegated
 *  ownership, set for company ownership; subjectUserId surfaces the
 *  on-behalf-of user when the actor is a delegate. */
export interface WorkspaceContext {
  /** The user doing the writing (always the current authenticated user). */
  actorUserId: string;
  /** Owner of the resulting row — what gets stored in user_id. For
   *  personal: actor itself. For delegated: the subject user. For
   *  company: still the actor (audit trail) — companyId carries ownership. */
  ownerUserId: string;
  /** Owner of the resulting row — what gets stored in company_id. */
  ownerCompanyId: string | null;
}

/** 403 FORBIDDEN — the ONE code every workspace refusal answers with. */
export class WorkspaceForbiddenError extends DomainError {
  constructor(message = "You do not have permission to act on this workspace.") {
    super(403, "FORBIDDEN", message);
    this.name = "WorkspaceForbiddenError";
  }
}

const defaultDeps = (): CompanyScopeDeps => ({ db: getDb() });

// ─── Auth core ──────────────────────────────────────────────────────────────

/** Returns true iff `actor` may write on behalf of (ownerUserId, ownerCompanyId).
 *  Self / company-member / delegated-grant are all checked here. */
export async function canActFor(
  actor: string,
  ownerUserId: string,
  ownerCompanyId: string | null,
  deps: CompanyScopeDeps = defaultDeps(),
): Promise<boolean> {
  // Self.
  if (actor === ownerUserId && ownerCompanyId == null) return true;
  // Company member (or owner / contractor — userCompanyRoleAssociations
  // makes no distinction; role is a free-form string).
  if (ownerCompanyId) {
    const ok = await userCanAccessCompany(actor, ownerCompanyId, deps);
    if (ok) return true;
  }
  // Delegated grant from the subject user to this actor.
  if (ownerUserId !== actor) {
    const granted = await hasActiveGrant(actor, ownerUserId, "studio", deps);
    if (granted) return true;
  }
  return false;
}

/** Throws WorkspaceForbiddenError when the actor cannot write on behalf
 *  of the given owner. Used by service methods after loading a row. */
export async function assertCanWrite(
  actor: string,
  ownerUserId: string,
  ownerCompanyId: string | null,
  deps: CompanyScopeDeps = defaultDeps(),
): Promise<void> {
  const ok = await canActFor(actor, ownerUserId, ownerCompanyId, deps);
  if (!ok) throw new WorkspaceForbiddenError();
}

/** Resolves a client-supplied workspace selection into a verified
 *  WorkspaceContext suitable for INSERTs. Throws if the actor lacks
 *  permission for the selected workspace. */
export async function resolveWorkspaceForWrite(
  actorUserId: string,
  selection: WorkspaceSelection,
  deps: CompanyScopeDeps = defaultDeps(),
): Promise<WorkspaceContext> {
  if (!selection || selection.kind === "personal") {
    return { actorUserId, ownerUserId: actorUserId, ownerCompanyId: null };
  }
  if (selection.kind === "company") {
    const ok = await userCanAccessCompany(actorUserId, selection.companyId, deps);
    if (!ok) throw new WorkspaceForbiddenError();
    return { actorUserId, ownerUserId: actorUserId, ownerCompanyId: selection.companyId };
  }
  // delegated
  const granted = await hasActiveGrant(actorUserId, selection.subjectUserId, "studio", deps);
  if (!granted) throw new WorkspaceForbiddenError();
  return { actorUserId, ownerUserId: selection.subjectUserId, ownerCompanyId: null };
}

// ─── Read-side helpers ──────────────────────────────────────────────────────

/** All workspaces the actor can see / act through:
 *   - their own personal workspace (always)
 *   - every company they own or have an active membership in
 *   - every job seeker who has granted them an active studio scope
 */
export async function listAccessibleWorkspaces(
  actorUserId: string,
  deps: CompanyScopeDeps = defaultDeps(),
): Promise<{
  companyIds: string[];
  delegatedSubjectUserIds: string[];
}> {
  const [companyIds, delegatedSubjectUserIds] = await Promise.all([
    getUserCompanyIds(actorUserId, deps),
    listSubjectsGrantedTo(actorUserId, "studio", deps),
  ]);
  return { companyIds, delegatedSubjectUserIds };
}

/** Builds a Drizzle WHERE predicate covering every row the actor can read:
 *
 *    user_id = :actor                 -- own personal rows
 *    OR company_id IN :companyIds     -- rows in companies they belong to
 *    OR user_id IN :delegatedIds      -- rows owned by job seekers who
 *                                        granted this actor edit rights
 *
 *  When `restrictToWorkspace` is set, narrows to that single workspace
 *  (caller must verify membership first via assertCanWrite). */
export function buildOwnershipFilter(args: {
  userIdColumn: any;
  companyIdColumn: any;
  actorUserId: string;
  companyIds: string[];
  delegatedSubjectUserIds: string[];
  restrictToWorkspace?:
    | { kind: "personal" }
    | { kind: "company"; companyId: string }
    | { kind: "delegated"; subjectUserId: string }
    | null;
}): SQL | undefined {
  const {
    userIdColumn,
    companyIdColumn,
    actorUserId,
    companyIds,
    delegatedSubjectUserIds,
    restrictToWorkspace,
  } = args;

  if (restrictToWorkspace?.kind === "personal") {
    return and(eq(userIdColumn, actorUserId), isNull(companyIdColumn));
  }
  if (restrictToWorkspace?.kind === "company") {
    return eq(companyIdColumn, restrictToWorkspace.companyId);
  }
  if (restrictToWorkspace?.kind === "delegated") {
    return and(eq(userIdColumn, restrictToWorkspace.subjectUserId), isNull(companyIdColumn));
  }

  const predicates: SQL[] = [eq(userIdColumn, actorUserId)];
  if (companyIds.length > 0) {
    predicates.push(inArray(companyIdColumn, companyIds));
  }
  if (delegatedSubjectUserIds.length > 0) {
    // Delegated rows are personal-side (companyId IS NULL) and owned by
    // a subject who granted this actor.
    predicates.push(
      and(inArray(userIdColumn, delegatedSubjectUserIds), isNull(companyIdColumn))!,
    );
  }
  return predicates.length === 1 ? predicates[0] : or(...predicates);
}

// ─── Grant lookups (workspace_grants) ───────────────────────────────────────

/** The "this workspace_grants row is live" half of the delegated-grant rule:
 *  right scope, active, not expired. Callers add the subject / contributor
 *  match — as values (hasActiveGrant) or as correlated columns in a SQL
 *  EXISTS (e.g. PitchRepository's take attribution) — so the liveness rule
 *  is defined once. */
export function activeGrantConditions(scope: string): SQL {
  return and(
    eq(schema.workspaceGrants.scope, scope),
    eq(schema.workspaceGrants.isActive, true),
    // Honour expiry if set.
    or(
      isNull(schema.workspaceGrants.expiresAt),
      sql`${schema.workspaceGrants.expiresAt} > NOW()`,
    )!,
  )!;
}

async function hasActiveGrant(
  contributorUserId: string,
  subjectUserId: string,
  scope: string,
  deps: CompanyScopeDeps,
): Promise<boolean> {
  const [row] = await deps.db
    .select({ id: schema.workspaceGrants.id })
    .from(schema.workspaceGrants)
    .where(
      and(
        eq(schema.workspaceGrants.subjectUserId, subjectUserId),
        eq(schema.workspaceGrants.contributorUserId, contributorUserId),
        activeGrantConditions(scope),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function listSubjectsGrantedTo(
  contributorUserId: string,
  scope: string,
  deps: CompanyScopeDeps,
): Promise<string[]> {
  const rows = await deps.db
    .select({ subjectUserId: schema.workspaceGrants.subjectUserId })
    .from(schema.workspaceGrants)
    .where(
      and(
        eq(schema.workspaceGrants.contributorUserId, contributorUserId),
        activeGrantConditions(scope),
      ),
    );
  // Dedupe since the unique index is on (subject, contributor, scope) but
  // a subject may grant multiple scopes in future.
  return Array.from(new Set(rows.map((r) => r.subjectUserId)));
}

export { userCanAccessCompany, getUserCompanyIds };
