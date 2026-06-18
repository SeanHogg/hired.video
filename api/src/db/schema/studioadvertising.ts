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
  integer,
  index,
  uniqueIndex,
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
    // Event taxonomy. `impression` is for paid-media style counts
    // posted by off-platform ad networks (Google Display Network, Meta
    // Ads, etc.) — one row per ad-network-reported impression, distinct
    // from in-platform `view` events. See `VideoAnalyticsEvent` type in
    // `frontend/lib/analytics/event-types.ts` for the SSoT enum.
    event:     text("event").notNull(),   // "view" | "impression" | "cta_click" | "share"
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
    // Project membership lives in `videoCampaignProjects` (junction) as of
    // migration 0462 (gap #983) — was a `project_ids` jsonb array, which
    // couldn't be queried ("campaigns featuring project X") or enforce
    // referential integrity. The DTO still exposes `projectIds: string[]`,
    // hydrated from the junction.
    stats:       jsonb("stats").notNull().default("{}"),        // cached rollup
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_video_campaigns_user").on(t.userId),
    index("idx_video_campaigns_company").on(t.companyId),
  ],
);

// ---------------------------------------------------------------------------
// Video campaign ↔ project membership (junction). Many-to-many between
// `video_campaigns` and `studio_projects`. Replaces the legacy
// `video_campaigns.project_ids` jsonb array (gap #983, migration 0462):
// the junction is queryable in both directions (the idx on project_id makes
// "every campaign featuring project X" indexed) and the FKs guarantee
// referential integrity (a deleted project/campaign cascades its rows away
// instead of leaving dangling ids). `position` preserves ordering.
// ---------------------------------------------------------------------------
export const videoCampaignProjects = pgTable(
  "video_campaign_projects",
  {
    campaignId: uuid("campaign_id").notNull().references(() => videoCampaigns.id, { onDelete: "cascade" }),
    projectId:  uuid("project_id").notNull().references(() => studioProjects.id, { onDelete: "cascade" }),
    position:   integer("position").notNull().default(0),
    createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_video_campaign_projects").on(t.campaignId, t.projectId),
    index("idx_video_campaign_projects_project").on(t.projectId),
  ],
);
