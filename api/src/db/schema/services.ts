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

// ---------------------------------------------------------------------------
// Service Offerings — items a job seeker can sell/offer to other users
// ---------------------------------------------------------------------------
export const serviceOfferings = pgTable("service_offerings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  priceCents: integer("price_cents").notNull().default(0),
  // priceVisible=false means price shown only after inquiry ("contact for pricing")
  priceVisible: boolean("price_visible").default(true).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  deliveryDays: integer("delivery_days"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ServiceOffering = typeof serviceOfferings.$inferSelect;
export type NewServiceOffering = typeof serviceOfferings.$inferInsert;

// ---------------------------------------------------------------------------
// Service Inquiries / Leads
// ---------------------------------------------------------------------------
export const serviceInquiries = pgTable("service_inquiries", {
  id: uuid("id").primaryKey().defaultRandom(),
  serviceId: uuid("service_id").notNull().references(() => serviceOfferings.id, { onDelete: "cascade" }),
  fromUserId: uuid("from_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Denormalised for easy queries; equals serviceOffering.userId at creation time
  providerId: uuid("provider_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  message: text("message"),
  // pending | accepted | rejected | completed
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  // inquiry = price-hidden contact; purchase = direct buy (price was visible)
  orderType: varchar("order_type", { length: 20 }).default("inquiry").notNull(),
  paidAmountCents: integer("paid_amount_cents").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ServiceInquiry = typeof serviceInquiries.$inferSelect;
export type NewServiceInquiry = typeof serviceInquiries.$inferInsert;

// ---------------------------------------------------------------------------
// Push Subscriptions — Web Push / PWA notification endpoints
// ---------------------------------------------------------------------------
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // endpoint is globally unique per subscription
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
