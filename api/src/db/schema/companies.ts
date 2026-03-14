import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const companyProfiles = pgTable("company_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).unique(),
  description: text("description"),
  website: varchar("website", { length: 500 }),
  logoUrl: text("logo_url"),
  industry: varchar("industry", { length: 100 }),
  size: varchar("size", { length: 50 }),
  foundedYear: integer("founded_year"),
  headquarters: varchar("headquarters", { length: 255 }),
  isVerified: boolean("is_verified").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CompanyProfile = typeof companyProfiles.$inferSelect;
export type NewCompanyProfile = typeof companyProfiles.$inferInsert;

export const userCompanyRoleAssociations = pgTable("user_company_role_associations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 100 }).notNull().default("member"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserCompanyRoleAssociation = typeof userCompanyRoleAssociations.$inferSelect;
export type NewUserCompanyRoleAssociation = typeof userCompanyRoleAssociations.$inferInsert;

export const companyFollowers = pgTable("company_followers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CompanyFollower = typeof companyFollowers.$inferSelect;
export type NewCompanyFollower = typeof companyFollowers.$inferInsert;
