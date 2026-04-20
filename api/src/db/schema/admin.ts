import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

// ---------------------------------------------------------------------------
// Impersonation sessions
// ---------------------------------------------------------------------------
export const impersonationSessions = pgTable("impersonation_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  superAdminId: uuid("super_admin_id").notNull().references(() => users.id),
  targetUserId: uuid("target_user_id").notNull().references(() => users.id),
  tokenId: text("token_id").notNull().unique(), // jti claim in the JWT
  reason: text("reason").notNull(),
  debuggerEnabled: boolean("debugger_enabled").default(false).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  endReason: varchar("end_reason", { length: 50 }), // 'manual' | 'expired' | 'admin_logout'
  pagesVisited: jsonb("pages_visited").$type<string[]>().default([]),
  writeBlockCount: integer("write_block_count").default(0).notNull(),
});

export type ImpersonationSession = typeof impersonationSessions.$inferSelect;
export type NewImpersonationSession = typeof impersonationSessions.$inferInsert;

// ---------------------------------------------------------------------------
// In-session role switches
// ---------------------------------------------------------------------------
export const impersonationRoleSwitches = pgTable("impersonation_role_switches", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => impersonationSessions.id, { onDelete: "cascade" }),
  fromRole: varchar("from_role", { length: 100 }).notNull(),
  toRole: varchar("to_role", { length: 100 }).notNull(),
  switchedAt: timestamp("switched_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ImpersonationRoleSwitch = typeof impersonationRoleSwitches.$inferSelect;
export type NewImpersonationRoleSwitch = typeof impersonationRoleSwitches.$inferInsert;

// ---------------------------------------------------------------------------
// Role-level permission overrides (layers on top of coded defaults)
// ---------------------------------------------------------------------------
export const rolePermissionOverrides = pgTable("role_permission_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  role: varchar("role", { length: 100 }).notNull(),
  permissionKey: varchar("permission_key", { length: 200 }).notNull(),
  granted: boolean("granted").notNull(), // true = explicit grant, false = explicit revoke
  reason: text("reason"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RolePermissionOverride = typeof rolePermissionOverrides.$inferSelect;
export type NewRolePermissionOverride = typeof rolePermissionOverrides.$inferInsert;

// ---------------------------------------------------------------------------
// Modules (feature bundles)
// ---------------------------------------------------------------------------
export const modules = pgTable("modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull().unique(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  description: text("description"),
  requiredRole: varchar("required_role", { length: 100 }).notNull(),
  planTier: varchar("plan_tier", { length: 50 }).default("free").notNull(),
  permissions: jsonb("permissions").$type<string[]>().default([]),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Module = typeof modules.$inferSelect;
export type NewModule = typeof modules.$inferInsert;

// ---------------------------------------------------------------------------
// User module assignments
// ---------------------------------------------------------------------------
export const userModuleAssignments = pgTable("user_module_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  moduleId: uuid("module_id").notNull().references(() => modules.id, { onDelete: "cascade" }),
  assignedBy: uuid("assigned_by").references(() => users.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export type UserModuleAssignment = typeof userModuleAssignments.$inferSelect;
export type NewUserModuleAssignment = typeof userModuleAssignments.$inferInsert;

// ---------------------------------------------------------------------------
// Per-user permission overrides
// ---------------------------------------------------------------------------
export const userPermissionOverrides = pgTable("user_permission_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  permissionKey: varchar("permission_key", { length: 200 }).notNull(),
  granted: boolean("granted").default(true).notNull(),
  source: varchar("source", { length: 200 }).notNull(), // 'module:<id>' | 'direct'
  grantedBy: uuid("granted_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserPermissionOverride = typeof userPermissionOverrides.$inferSelect;
export type NewUserPermissionOverride = typeof userPermissionOverrides.$inferInsert;

// ---------------------------------------------------------------------------
// Per-user plan overrides — SuperAdmin "admin override"
// ---------------------------------------------------------------------------
// Sidecar to the real `subscriptions` row. Lets staff comp a plan or raise
// the monthly token limit without mutating Stripe-backed state. One row per
// user (user_id PK). The resolver in domains/planOverride/resolver.ts owns
// the "is this still active?" decision; this table is the raw record.
//
// Encoding:
//   • plan_slug IS NULL  → keep subscription plan, only token-limit is
//                          overridden.
//   • plan_slug = "free"|"pro"|"unlimited" → effective plan override.
//   • monthly_token_limit IS NULL → use plan default.
//   • monthly_token_limit = -1    → unlimited (sentinel; zero is a valid
//                                   real value meaning "no tokens allowed").
//   • expires_at IS NULL → permanent.
export const userPlanOverrides = pgTable("user_plan_overrides", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  planSlug: varchar("plan_slug", { length: 50 }),
  monthlyTokenLimit: integer("monthly_token_limit"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  reason: text("reason").notNull(),
  grantedBy: uuid("granted_by").notNull().references(() => users.id),
  grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserPlanOverride = typeof userPlanOverrides.$inferSelect;
export type NewUserPlanOverride = typeof userPlanOverrides.$inferInsert;

// ---------------------------------------------------------------------------
// Admin audit log (append-only)
// ---------------------------------------------------------------------------
export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  impersonationSessionId: uuid("impersonation_session_id").references(() => impersonationSessions.id),
  action: varchar("action", { length: 200 }).notNull(),
  targetType: varchar("target_type", { length: 50 }), // 'user' | 'role' | 'module' | 'tenant'
  targetId: text("target_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type NewAdminAuditLog = typeof adminAuditLog.$inferInsert;
