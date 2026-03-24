import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  numeric,
  integer,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { jobItems } from "./jobs.js";

// ---------------------------------------------------------------------------
// Exclusive Job Boards + Bidding
// ---------------------------------------------------------------------------

// Premium exclusive job boards (not publicly listed)
export const exclusiveBoards = pgTable("exclusive_boards", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  category: varchar("category", { length: 100 }), // tech | finance | healthcare | executive | etc.
  audienceSize: integer("audience_size").default(0),
  typicalTimeToFill: integer("typical_time_to_fill_days"),
  pricePerPost: numeric("price_per_post").notNull(), // base price
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  isPremiumOnly: boolean("is_premium_only").default(true).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ExclusiveBoard = typeof exclusiveBoards.$inferSelect;
export type NewExclusiveBoard = typeof exclusiveBoards.$inferInsert;

// Bid placed by a recruiter/employer to post a job on an exclusive board
export const boardBids = pgTable("board_bids", {
  id: uuid("id").primaryKey().defaultRandom(),
  boardId: uuid("board_id").notNull().references(() => exclusiveBoards.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobItems.id, { onDelete: "set null" }),
  bidderId: uuid("bidder_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bidAmount: numeric("bid_amount").notNull(),
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  durationDays: integer("duration_days").default(30).notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending | accepted | rejected | expired | active | completed
  message: text("message"), // optional message to board admin
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id, { onDelete: "set null" }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BoardBid = typeof boardBids.$inferSelect;
export type NewBoardBid = typeof boardBids.$inferInsert;
