/**
 * Reference management (#1677) — NDA-protected, selectively-shared
 * reference packets for the senior-exec audience. Exec references are
 * confidential and given to specific viewers under NDA, revocably.
 *
 *   reference_contacts — the owner's reference people (private by default)
 *   shares             — share_links rows of kind 'reference_packet'
 *                        (shareLinks.ts): a chosen subset of contacts
 *                        shared with one viewer (by email) via an
 *                        unguessable token, optionally behind an NDA
 *                        gate, with expiry + revoke. The contact set is a
 *                        jsonb id snapshot (`contact_ids`).
 */
import { pgTable, uuid, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const referenceContacts = pgTable(
  "reference_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    title: varchar("title", { length: 200 }),
    company: varchar("company", { length: 200 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    /** "Former manager", "Board chair", "Peer", … */
    relationship: varchar("relationship", { length: 120 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("reference_contacts_owner_idx").on(t.ownerUserId)],
);

// Reference shares live in share_links (shareLinks.ts, kind reference_packet)
// since W3-A migration 0583.

export type ReferenceContact = typeof referenceContacts.$inferSelect;
export type NewReferenceContact = typeof referenceContacts.$inferInsert;
