/** Workforce employer roster read model (last-7-days punch totals). */

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { resolveEmployerCompanyIds } from "./tenancy.js";

const { userCompanyRoleAssociations, users, taskTimeEntries } = schema;

/** Roster for the employer's Workforce settings tab — list of active
 *  employees in companies the employer manages, with their last-7-days
 *  punch totals. */
export async function getCompanyRoster(employerId: string, db = getDb()) {
  const employerCompanies = await resolveEmployerCompanyIds(employerId, db);
  if (employerCompanies.length === 0) return [];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  const rows = await db.select({
    userId: userCompanyRoleAssociations.userId,
    companyId: userCompanyRoleAssociations.companyId,
    employeeName: users.name,
    employeeEmail: users.email,
    isActive: userCompanyRoleAssociations.isActive,
    associationCreatedAt: userCompanyRoleAssociations.createdAt,
  })
    .from(userCompanyRoleAssociations)
    .innerJoin(users, eq(users.id, userCompanyRoleAssociations.userId))
    .where(and(
      eq(userCompanyRoleAssociations.role, "employee"),
      inArray(userCompanyRoleAssociations.companyId, employerCompanies),
    ));

  // Roll up last-7-days totals per employee. One query per employee
  // would be N+1; aggregate in one pass.
  const totalsByUser = new Map<string, number>();
  if (rows.length > 0) {
    const userIds = rows.map((r) => r.userId);
    const totals = await db.select({
      userId: taskTimeEntries.userId,
      totalSec: sql<number>`COALESCE(SUM(${taskTimeEntries.durationSec}), 0)::int`,
    })
      .from(taskTimeEntries)
      .where(and(
        inArray(taskTimeEntries.userId, userIds),
        gte(taskTimeEntries.startedAt, sevenDaysAgo),
      ))
      .groupBy(taskTimeEntries.userId);
    for (const t of totals) {
      totalsByUser.set(t.userId, Number(t.totalSec ?? 0));
    }
  }

  return rows.map((r) => ({
    ...r,
    last7DaysHours: ((totalsByUser.get(r.userId) ?? 0) / 3600).toFixed(2),
  }));
}
