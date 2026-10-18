/**
 * CompanyMembershipsRepository — reads on the user ↔ company membership
 * aggregate (`user_company_role_associations`). Active memberships only
 * (`is_active`): a deactivated association is not a member.
 */
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { userCompanyRoleAssociations: m } = schema;

/** Whether the user holds an active membership in the company. */
export async function isActiveCompanyMember(userId: string, companyId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: m.id })
    .from(m)
    .where(and(eq(m.userId, userId), eq(m.companyId, companyId), eq(m.isActive, true)))
    .limit(1);
  return Boolean(row);
}

/** User ids of the company's active members. */
export async function listActiveCompanyMemberUserIds(companyId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ userId: m.userId })
    .from(m)
    .where(and(eq(m.companyId, companyId), eq(m.isActive, true)));
  return rows.map((r) => r.userId);
}
