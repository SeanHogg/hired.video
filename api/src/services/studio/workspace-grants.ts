// Studio workspace listing + delegation-grant use cases (routes/workspaces.ts).
// Only the subject manages their own delegations; the authorization rule
// itself lives in ./workspace.ts.

import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { CompaniesRepository } from "../../repositories/companiesRepository.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import {
  WorkspaceGrantsRepository,
  type GrantGivenRow,
  type GrantReceivedRow,
  type WorkspaceGrantRow,
} from "../../repositories/workspaceGrantsRepository.js";
import { listAccessibleWorkspaces } from "./workspace.js";

export interface AccessibleWorkspaces {
  personal: { kind: "personal"; label: string };
  companies: Array<{ kind: "company"; companyId: string; label: string; slug: string | null; logoUrl: string | null }>;
  delegated: Array<{ kind: "delegated"; subjectUserId: string; label: string }>;
}

/** Every workspace the user can act in: personal + company memberships + delegated. */
export async function listWorkspacesFor(userId: string): Promise<AccessibleWorkspaces> {
  const db = getDb();
  const { companyIds, delegatedSubjectUserIds } = await listAccessibleWorkspaces(userId);
  // Both lookups bind ids with `inArray` (a real Postgres array) and skip the
  // query for an empty list.
  const [companies, delegated] = await Promise.all([
    new CompaniesRepository(db).findCompaniesByIds(companyIds),
    new UsersRepository(db).findManyByIds(delegatedSubjectUserIds),
  ]);
  return {
    personal: { kind: "personal", label: "Personal" },
    companies: companies.map((row) => ({
      kind: "company",
      companyId: row.id,
      label: row.name,
      slug: row.slug,
      logoUrl: row.logoUrl,
    })),
    delegated: delegated.map((row) => ({
      kind: "delegated",
      subjectUserId: row.id,
      label: row.name ?? row.email ?? "Unknown",
    })),
  };
}

export function listGrantsGivenBy(userId: string): Promise<GrantGivenRow[]> {
  return new WorkspaceGrantsRepository(getDb()).listGivenBy(userId);
}

export function listGrantsReceivedBy(userId: string): Promise<GrantReceivedRow[]> {
  return new WorkspaceGrantsRepository(getDb()).listActiveReceivedBy(userId);
}

export interface CreateGrantInput {
  contributorEmail: string;
  role: string;
  scope: string;
  expiresAt?: string;
}

/** Invite a contributor (subject = caller). Idempotent: an existing active
 *  grant for (subject, contributor, scope) is returned instead of failing on
 *  the unique index. */
export async function createGrant(subjectUserId: string, input: CreateGrantInput): Promise<WorkspaceGrantRow> {
  const db = getDb();
  const contributor = await new UsersRepository(db).findByEmail(input.contributorEmail);
  if (!contributor) {
    throw new DomainError(404, "NOT_FOUND", "Contributor must have a hired.video account first.");
  }
  if (contributor.id === subjectUserId) {
    throw new DomainError(400, "BAD_REQUEST", "You cannot invite yourself.");
  }
  const grants = new WorkspaceGrantsRepository(db);
  const existing = await grants.findActive(subjectUserId, contributor.id, input.scope);
  if (existing) return existing;
  return grants.insert({
    subjectUserId,
    contributorUserId: contributor.id,
    role: input.role,
    scope: input.scope,
    grantedByUserId: subjectUserId,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
  });
}

/** Revoke a grant — only its subject may. */
export async function revokeGrant(subjectUserId: string, id: string): Promise<{ id: string; revoked: true }> {
  const updated = await new WorkspaceGrantsRepository(getDb()).revoke(id, subjectUserId);
  if (!updated) throw new DomainError(404, "NOT_FOUND", "Grant not found");
  return { id: updated.id, revoked: true };
}
