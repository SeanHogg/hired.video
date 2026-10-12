/**
 * Workspace Grants — "X may act on behalf of Y" beyond company membership.
 *
 * Covers the user-to-user delegation case (a video editor / coach hired
 * by a job seeker to edit videos on the seeker's behalf). Company-side
 * delegation (employees + contractors) lives in
 * user_company_role_associations and is NOT moved here.
 *
 * Together with userCompanyRoleAssociations, this table answers the
 * universal "may :actor write on behalf of :owner?" question, enforced
 * in services/studio/workspace.ts canActFor() — the single source of
 * truth every studio mutation routes through.
 *
 * See migration 0059_workspace_grants.sql.
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const workspaceGrants = pgTable(
  "workspace_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The user being acted on behalf of (the "owner" subject). */
    subjectUserId: uuid("subject_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The user doing the acting (the contributor / editor). */
    contributorUserId: uuid("contributor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Free-form so we can introduce 'reviewer', 'manager', etc. later
     *  without a schema change. Read by canActFor() only as a write-vs-
     *  read split when we add reviewer-only roles. */
    role: text("role").notNull().default("editor"),
    /** Surface scope. 'studio' = video projects + videos + templates.
     *  'all' = future-proof catch-all (resume editing, etc.). */
    scope: text("scope").notNull().default("studio"),
    isActive: boolean("is_active").notNull().default(true),
    /** Typically equals subjectUserId (the seeker invited the editor),
     *  but supports admin-granted access too. */
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_workspace_grants_subject").on(t.subjectUserId),
    index("idx_workspace_grants_contributor").on(t.contributorUserId),
    // One active grant per (subject, contributor, scope). Re-granting after
    // revoke creates a new active row; the historical revoked rows stay
    // for audit.
    uniqueIndex("uq_workspace_grants_active")
      .on(t.subjectUserId, t.contributorUserId, t.scope)
      .where(sql`is_active = true`),
  ],
);

export type WorkspaceGrant = typeof workspaceGrants.$inferSelect;
export type NewWorkspaceGrant = typeof workspaceGrants.$inferInsert;
