import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  subject: varchar("subject", { length: 500 }),
  type: varchar("type", { length: 50 }).default("direct").notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  // #1612 — canonical soft-delete timestamp, added in 0154.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export const conversationParticipants = pgTable("conversation_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 50 }).default("member").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  leftAt: timestamp("left_at", { withTimezone: true }),
  // Added in 0163 — role changes + leftAt updates need audit.
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_conversation_participants_user").on(t.userId),
  index("idx_conversation_participants_conversation_user").on(t.conversationId, t.userId),
]);

export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type NewConversationParticipant = typeof conversationParticipants.$inferInsert;

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  contentType: varchar("content_type", { length: 50 }).default("text").notNull(),
  isEdited: boolean("is_edited").default(false).notNull(),
  isDeleted: boolean("is_deleted").default(false).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_messages_conversation_created").on(t.conversationId, t.createdAt.desc().nullsFirst()),
  index("idx_messages_sender_created").on(t.senderId, t.createdAt.desc().nullsFirst()),
]);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export const messageReadReceipts = pgTable("message_read_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at", { withTimezone: true }).defaultNow().notNull(),
  // Added in 0163 — receipt retraction / re-mark-unread should be auditable.
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_message_read_receipts_user_message").on(t.userId, t.messageId),
  index("idx_message_read_receipts_message_id").on(t.messageId),
]);

export type MessageReadReceipt = typeof messageReadReceipts.$inferSelect;
export type NewMessageReadReceipt = typeof messageReadReceipts.$inferInsert;

export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  subject: varchar("subject", { length: 500 }).notNull(),
  htmlBody: text("html_body").notNull(),
  textBody: text("text_body"),
  variables: jsonb("variables").default([]),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type NewEmailTemplate = typeof emailTemplates.$inferInsert;

export const emailCampaigns = pgTable("email_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  templateId: uuid("template_id").references(() => emailTemplates.id, { onDelete: "set null" }),
  subject: varchar("subject", { length: 500 }).notNull(),
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  // Campaign-engine columns (migration 0204). A campaign renders from its
  // attached template OR `htmlBody` (inline override). `audience` is the
  // CampaignAudience discriminated union the send worker resolves to a
  // concrete recipient list. `senderCompanyId` attributes the send — for
  // SuperAdmin marketing campaigns this is the hired.video platform company.
  description: varchar("description", { length: 1000 }),
  htmlBody: text("html_body"),
  fromName: varchar("from_name", { length: 255 }),
  // Marketing category (see shared/email-consent.ts) the per-recipient opt-out
  // gate checks at send time. Migration 0205.
  category: varchar("category", { length: 32 }).default("product_launches").notNull(),
  audience: jsonb("audience").$type<Record<string, unknown>>(),
  senderCompanyId: uuid("sender_company_id"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_email_campaigns_status_scheduled").on(t.status, t.scheduledAt),
  index("idx_email_campaigns_created_by_user_id").on(t.createdByUserId),
  index("idx_email_campaigns_template_id").on(t.templateId),
]);

export type EmailCampaign = typeof emailCampaigns.$inferSelect;
export type NewEmailCampaign = typeof emailCampaigns.$inferInsert;

export const emailCampaignRecipients = pgTable("email_campaign_recipients", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => emailCampaigns.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  // Display name + per-recipient {{var}} map, snapshotted at audience-resolve
  // time so a later edit to the user row can't retro-change a sent email
  // (migration 0204). `errorMessage` holds the provider failure for triage.
  name: varchar("name", { length: 255 }),
  personalization: jsonb("personalization").$type<Record<string, string>>(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  clickedAt: timestamp("clicked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_campaign_recipients_campaign_status").on(t.campaignId, t.status),
  // #2305 — legacy UNIQUE (migration 0204_campaign_engine.sql); duplicates resolved by 0518_dedupe_unique_indexes.sql.
  uniqueIndex("uq_campaign_recipients_campaign_email").on(t.campaignId, t.email),
  index("idx_email_campaign_recipients_user_id").on(t.userId),
]);

export type EmailCampaignRecipient = typeof emailCampaignRecipients.$inferSelect;
export type NewEmailCampaignRecipient = typeof emailCampaignRecipients.$inferInsert;

/**
 * email_suppressions — global unsubscribe / do-not-email list (migration
 * 0204). Marketing campaigns MUST skip any address here (CAN-SPAM). Populated
 * by the public one-click unsubscribe endpoint and any hard-bounce handling.
 * Keyed by lowercased email; reason is free-text ("unsubscribe" | "bounce" |
 * "complaint" | "manual").
 */
export const emailSuppressions = pgTable("email_suppressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  reason: varchar("reason", { length: 64 }).default("unsubscribe").notNull(),
  // The campaign whose footer triggered the opt-out, when known — analytics only.
  campaignId: uuid("campaign_id").references(() => emailCampaigns.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_email_suppressions_campaign_id").on(t.campaignId),
]);

export type EmailSuppression = typeof emailSuppressions.$inferSelect;
export type NewEmailSuppression = typeof emailSuppressions.$inferInsert;

/**
 * email_marketing_preferences — the email-keyed marketing consent ledger
 * (migration 0205). Covers users AND non-users (leads, explicit-list
 * recipients) uniformly, since marketing goes to all three. Distinct from
 * `email_suppressions`, which is the hard, system-set, NOT-user-reversible
 * list (bounces / complaints).
 *
 * Opt-out model: a missing row = fully subscribed. `unsubscribedAll` is the
 * master kill switch; `categories` holds explicit per-category choices
 * (`{cat:false}` = opted out of that category). `token` is the opaque,
 * unguessable bearer credential embedded in unsubscribe links — NO email is
 * ever placed in a URL. The ONLY writer that may re-subscribe is the explicit
 * preference-center action (CAN-SPAM stickiness — see shared/email-consent.ts).
 */
export const emailMarketingPreferences = pgTable("email_marketing_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  // 32-byte random, base64url — the unsubscribe/preference link key.
  token: varchar("token", { length: 64 }).notNull().unique(),
  unsubscribedAll: boolean("unsubscribed_all").default(false).notNull(),
  categories: jsonb("categories").$type<Record<string, boolean>>().default({}).notNull(),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  resubscribedAt: timestamp("resubscribed_at", { withTimezone: true }),
  source: varchar("source", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_email_marketing_preferences_user_id").on(t.userId),
]);

export type EmailMarketingPreference = typeof emailMarketingPreferences.$inferSelect;
export type NewEmailMarketingPreference = typeof emailMarketingPreferences.$inferInsert;

export const communicationTracking = pgTable("communication_tracking", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  type: varchar("type", { length: 50 }).notNull(),
  channel: varchar("channel", { length: 50 }).notNull(),
  referenceId: uuid("reference_id"),
  referenceType: varchar("reference_type", { length: 100 }),
  status: varchar("status", { length: 50 }).default("sent").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_communication_tracking_user_id").on(t.userId),
]);

export type CommunicationTracking = typeof communicationTracking.$inferSelect;
export type NewCommunicationTracking = typeof communicationTracking.$inferInsert;



export const interviews = pgTable("interviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull(),
  scheduledBy: uuid("scheduled_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  interviewerIds: jsonb("interviewer_ids").default([]),
  type: varchar("type", { length: 50 }).default("video").notNull(),
  status: varchar("status", { length: 50 }).default("scheduled").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").default(60),
  meetingUrl: text("meeting_url"),
  notes: text("notes"),
  feedback: text("feedback"),
  rating: integer("rating"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_interviews_scheduled_by").on(t.scheduledBy),
]);

export type Interview = typeof interviews.$inferSelect;
export type NewInterview = typeof interviews.$inferInsert;
