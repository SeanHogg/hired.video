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
// Exclusive Job Boards + Bidding (legacy — recruiter pays to post on a board)
// + Recruiter Sourcing Marketplace (new — company posts a job with a fee,
//   external recruiters bid to source candidates).
//
// Both bid directions share the same `boardBids` table:
//   - Legacy "post-on-board" bid:     boardId NOT NULL, jobId NULLABLE
//   - New "source-this-job" bid:      boardId NULL,     jobId NOT NULL
// `bidderId` is the bidding recruiter in BOTH directions, so no semantic
// flip is needed there.
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

// Bid placed by a recruiter — either to post on an exclusive board (legacy)
// or to win a job-sourcing assignment (new). Direction is inferred from
// which FK is populated; see migration 0046_sourcing_marketplace.sql.
export const boardBids = pgTable("board_bids", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable now (was NOT NULL) — sourcing bids don't reference a board.
  boardId: uuid("board_id").references(() => exclusiveBoards.id, { onDelete: "cascade" }),
  // Required for sourcing bids; legacy board bids may attach an optional jobId.
  jobId: uuid("job_id").references(() => jobItems.id, { onDelete: "set null" }),
  bidderId: uuid("bidder_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Used as "post fee" for board bids and "proposed sourcing fee" for sourcing bids.
  bidAmount: numeric("bid_amount").notNull(),
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  durationDays: integer("duration_days").default(30).notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending | accepted | rejected | expired | active | completed | withdrawn
  message: text("message"), // optional message to board admin / hiring company
  // Sourcing-bid extras (NULL on legacy board bids):
  proposalText: text("proposal_text"),
  candidatesSubmittedCount: integer("candidates_submitted_count").default(0),
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

export const SOURCING_BID_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "withdrawn",
  "expired",
  "completed",
] as const;
export type SourcingBidStatus = (typeof SOURCING_BID_STATUSES)[number];
