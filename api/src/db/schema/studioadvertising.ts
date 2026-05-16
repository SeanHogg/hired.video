/**
 * Studio Advertising Tables
 *
 * Supports the studio as an advertising/promotion tool for:
 *   - Companies (promotional videos, brand stories)
 *   - Recruiters (job ads, recruiter brand videos)
 *   - Job seekers (video resumes — existing use case)
 *
 * New tables:
 *   - studioBrandKits    — per-user brand colours/logo/font
 *   - videoAnalytics     — view + CTA click tracking per project (see 0085)
 *   - videoCampaigns     — group projects into ad campaigns with UTM tracking
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { companyProfiles } from "./companies.js";
import { studioProjects } from "./resumes.js";

// ---------------------------------------------------------------------------
// Brand kits — store a user's (or company's) brand identity
// (logo, colours, font). companyId added in migration 0063.
// ---------------------------------------------------------------------------
export const studioBrandKits = pgTable(
  "studio_brand_kits",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    userId:      text("user_id").notNull(),
    companyId:   uuid("company_id").references(() => companyProfiles.id, { onDelete: "cascade" }),
    name:        text("name").notNull().default("My Brand"),
    logoUrl:     text("logo_url"),
    primaryColor:   text("primary_color").notNull().default("#2563eb"),
    secondaryColor: text("secondary_color").notNull().default("#0f172a"),
    accentColor:    text("accent_color").notNull().default("#14b8a6"),
    fontFamily:  text("font_family").notNull().default("Inter"),
    isDefault:   boolean("is_default").notNull().default(false),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_studio_brand_kits_user").on(t.userId),
    index("idx_studio_brand_kits_company").on(t.companyId),
  ],
);

// ---------------------------------------------------------------------------
// Video analytics — lightweight view + CTA-click tracking. Keyed on
// studio_projects.id (migration 0085) so saved-public-but-unrendered
// projects can collect events — every other path was tripping over the
// videos-table dependency that pre-#665 designs assumed.
// ---------------------------------------------------------------------------
export const videoAnalytics = pgTable(
  "video_analytics",
  {
    id:        uuid("id").primaryKey().defaultRandom(),
    studioProjectId: uuid("studio_project_id").notNull().references(() => studioProjects.id, { onDelete: "cascade" }),
    userId:    text("user_id"),           // null = anonymous viewer
    event:     text("event").notNull(),   // "view" | "cta_click" | "share"
    referrer:  text("referrer"),
    campaignId: text("campaign_id"),
    metadata:  jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_video_analytics_project").on(t.studioProjectId),
    index("idx_video_analytics_event").on(t.event),
  ],
);

// ---------------------------------------------------------------------------
// Video campaigns — group videos for tracking a specific ad campaign
// ---------------------------------------------------------------------------
export const videoCampaigns = pgTable(
  "video_campaigns",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    userId:      text("user_id").notNull(),
    companyId:   uuid("company_id").references(() => companyProfiles.id, { onDelete: "cascade" }),
    name:        text("name").notNull(),
    description: text("description"),
    utmSource:   text("utm_source"),
    utmMedium:   text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    status:      text("status").notNull().default("active"),   // active | paused | archived
    projectIds:  jsonb("project_ids").notNull().default("[]"),  // studio_projects.id[] — renamed in 0085
    stats:       jsonb("stats").notNull().default("{}"),        // cached rollup
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_video_campaigns_user").on(t.userId),
    index("idx_video_campaigns_company").on(t.companyId),
  ],
);
