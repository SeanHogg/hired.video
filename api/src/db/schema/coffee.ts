/**
 * Coffee requests — the "Grab a coffee" proposal/accept flow.
 *
 * Lightweight ask between two users. On accept, CoffeeRequestService
 * writes:
 *   (a) one scheduled_events row with type='coffee'
 *   (b) two event_attendees rows (requester + recipient, status='going')
 *   (c) one tasks row owned by requester, source_event_id → (a),
 *       plus one shared_task_participants row for the recipient
 *   (d) accepted_event_id on this row → (a)
 *
 * All in one transaction. The shared task is the accountability hook:
 * it appears on both users' Tasks/Events tab until the meetup happens.
 *
 * See migration 0122_events_coffee_shared_tasks.sql for storage layout.
 */
import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { scheduledEvents } from "./calendar.js";

export const coffeeRequests = pgTable(
  "coffee_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterUserId: uuid("requester_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    message: text("message"),
    proposedAt: timestamp("proposed_at", { withTimezone: true }),
    proposedLocation: text("proposed_location"),
    proposedFormat: varchar("proposed_format", { length: 16 })
      .default("in_person")
      .notNull(), // in_person | remote
    // pending | accepted | declined | cancelled | expired
    status: varchar("status", { length: 16 }).default("pending").notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    responseMessage: text("response_message"),
    acceptedEventId: uuid("accepted_event_id").references(
      () => scheduledEvents.id,
      { onDelete: "set null" },
    ),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("idx_coffee_requests_recipient_status").on(
      t.recipientUserId,
      t.status,
      t.createdAt,
    ),
    index("idx_coffee_requests_requester_status").on(
      t.requesterUserId,
      t.status,
      t.createdAt,
    ),
    // Only one open request between the same pair at a time (direction-specific).
    uniqueIndex("uq_coffee_requests_pending_pair")
      .on(t.requesterUserId, t.recipientUserId)
      .where(sql`${t.status} = 'pending'`),
    index("idx_coffee_requests_accepted_event_id").on(t.acceptedEventId),
  ],
);

export type CoffeeRequest = typeof coffeeRequests.$inferSelect;
export type NewCoffeeRequest = typeof coffeeRequests.$inferInsert;
