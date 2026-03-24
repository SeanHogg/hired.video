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

// ─── Employer Branding Pages ──────────────────────────────────────────────────
// Paid add-on: dedicated culture/video branding page beyond basic company profile.

export const employerBrandingPages = pgTable("employer_branding_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }).unique(),
  heroVideoUrl: text("hero_video_url"),
  heroHeadline: varchar("hero_headline", { length: 200 }),
  heroSubtitle: text("hero_subtitle"),
  cultureStatement: text("culture_statement"),
  values: jsonb("values").default([]).$type<Array<{ title: string; description: string; emoji?: string }>>(),
  perks: jsonb("perks").default([]).$type<Array<{ title: string; description: string; icon?: string }>>(),
  mediaGallery: jsonb("media_gallery").default([]).$type<Array<{ url: string; type: "image" | "video"; caption?: string }>>(),
  teamHighlights: jsonb("team_highlights").default([]).$type<Array<{ name: string; role: string; quote: string; avatarUrl?: string }>>(),
  awardsAndRecognition: jsonb("awards_and_recognition").default([]).$type<Array<{ title: string; year?: number; imageUrl?: string }>>(),
  primaryColor: varchar("primary_color", { length: 20 }).default("#2563eb"),
  isPublished: boolean("is_published").default(false).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EmployerBrandingPage = typeof employerBrandingPages.$inferSelect;
export type NewEmployerBrandingPage = typeof employerBrandingPages.$inferInsert;
