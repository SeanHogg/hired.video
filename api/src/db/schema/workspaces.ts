/**
 * workspaces — parent table introduced by migration 0164 to anchor the
 * previously-orphaned `workspace_id` columns in workspace_tags,
 * workspace_job_types, workspace_sources, workspace_person_merge_policy,
 * person_merge_queue. Gap #1640 closure.
 *
 * Semantics: a workspace is owned by EITHER a user (personal workspace)
 * OR a company (tenant workspace). The XOR is enforced by a CHECK
 * constraint in 0164 (NOT VALID — placeholder rows backfilled with
 * NULL owners; the service layer + a separate backfill populates
 * ownership over time).
 *
 * Read this column via the canonical seam at services/studio/workspace.ts
 * `canActFor()` — never branch on owner_user_id vs owner_company_id at
 * the consumer site.
 */

import { pgTable, uuid, varchar, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { companyProfiles } from "./companies.js";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Set when this is a personal workspace (an individual user). */
  ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
  /** Set when this is a tenant workspace (a company). */
  ownerCompanyId: uuid("owner_company_id").references(() => companyProfiles.id, { onDelete: "cascade" }),
  /** Optional human label — defaults to a slug of the owner's name. */
  name: varchar("name", { length: 200 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_workspaces_owner_user").on(t.ownerUserId).where(sql`owner_user_id IS NOT NULL`),
  index("idx_workspaces_owner_company").on(t.ownerCompanyId).where(sql`owner_company_id IS NOT NULL`),
  check("workspaces_owner_xor", sql`(${t.ownerUserId} IS NOT NULL AND ${t.ownerCompanyId} IS NULL) OR (${t.ownerUserId} IS NULL AND ${t.ownerCompanyId} IS NOT NULL) OR (${t.ownerUserId} IS NULL AND ${t.ownerCompanyId} IS NULL)`),
]);

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
