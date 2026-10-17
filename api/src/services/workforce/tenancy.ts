/** Workforce tenant resolution (#1349) — employee / employer company lookups via userCompanyRoleAssociations. */

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { userCompanyRoleAssociations } = schema;

/** Resolve the company an employee belongs to. Returns null if the user
 *  is not an active employee in any company. The Phase 0 invite + accept
 *  flow guarantees a single active employee-UCRA per user, so we LIMIT 1. */
export async function resolveEmployeeCompanyId(
  userId: string,
  db = getDb(),
): Promise<string | null> {
  const [assoc] = await db
    .select({ companyId: userCompanyRoleAssociations.companyId })
    .from(userCompanyRoleAssociations)
    .where(and(
      eq(userCompanyRoleAssociations.userId, userId),
      eq(userCompanyRoleAssociations.role, "employee"),
      eq(userCompanyRoleAssociations.isActive, true),
    ))
    .limit(1);
  return assoc?.companyId ?? null;
}

/** Resolve the companies an employer can manage. An employer ↔ company
 *  link is also recorded via userCompanyRoleAssociations (role='employer').
 *  Most employers manage exactly one company; the API supports many. */
export async function resolveEmployerCompanyIds(
  userId: string,
  db = getDb(),
): Promise<string[]> {
  const rows = await db
    .select({ companyId: userCompanyRoleAssociations.companyId })
    .from(userCompanyRoleAssociations)
    .where(and(
      eq(userCompanyRoleAssociations.userId, userId),
      eq(userCompanyRoleAssociations.role, "employer"),
      eq(userCompanyRoleAssociations.isActive, true),
    ));
  return rows.map((r) => r.companyId);
}
