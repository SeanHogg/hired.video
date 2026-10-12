/**
 * Sourcing aggregate — companies open a job to external recruiters who bid
 * to source candidates.
 *
 * The sourcing *listing* (this table) is its own aggregate root, NOT a
 * property of the Job aggregate. This is a deliberate split: the Job
 * controls description / pay / requirements; the SourcingListing controls
 * the marketplace surface (fee, deadline, terms, accepting-bids state).
 * Bids (jobboards.boardBids) reference the job_id directly so a recruiter
 * never needs to know about the listing row.
 *
 * 1:1 with `jobItems` via the partial unique index on `job_id` — a job
 * never has two open sourcing listings at once.
 */
import { pgTable, uuid, integer, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { jobItems } from "./jobs.js";

export const jobSourcingListings = pgTable("job_sourcing_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().unique().references(() => jobItems.id, { onDelete: "cascade" }),
  /** Whether the marketplace currently accepts new bids on this job. */
  acceptsBids: boolean("accepts_bids").default(false).notNull(),
  /** Sourcing fee paid to the winning recruiter on hire (cents). */
  feeCents: integer("fee_cents"),
  /** Bids submitted after this date are blocked. */
  deadline: timestamp("deadline", { withTimezone: true }),
  /** Free-form terms (exclusivity, candidate spec, replacement guarantee…). */
  terms: text("terms"),
  /** Snapshot of the recruiter who won the assignment, if any. */
  winningBidderId: uuid("winning_bidder_id").references(() => users.id, { onDelete: "set null" }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_job_sourcing_listings_open").on(t.acceptsBids).where(sql`accepts_bids = TRUE`),
]);

export type JobSourcingListing = typeof jobSourcingListings.$inferSelect;
export type NewJobSourcingListing = typeof jobSourcingListings.$inferInsert;
