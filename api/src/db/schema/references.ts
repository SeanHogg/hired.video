/**
 * Reference management (#1677) — NDA-protected, selectively-shared
 * reference packets for the senior-exec audience. Exec references are
 * confidential and given to specific viewers under NDA, revocably.
 *
 *   reference_contacts — the owner's reference people (private by default)
 *   reference_shares   — a grant: a chosen subset of contacts shared with
 *                        one viewer (by email) via an unguessable token,
 *                        optionally behind an NDA gate, with expiry +
 *                        revoke. The shared contact set is a jsonb id
 *                        array (not a junction table) — a share is a
 *                        point-in-time snapshot of who was granted.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
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

export const referenceShares = pgTable(
  "reference_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** Unguessable token in the share URL — the ACL key. */
    token: varchar("token", { length: 64 }).notNull(),
    /** Who it's shared with (email — recipient may not have an account). */
    sharedWithEmail: varchar("shared_with_email", { length: 255 }).notNull(),
    /** Snapshot of granted contact ids (jsonb array of uuids). */
    contactIds: jsonb("contact_ids").$type<string[]>().default([]).notNull(),
    /** Optional label shown to the recipient ("References for the Acme CEO role"). */
    label: varchar("label", { length: 255 }),
    /** Gate the packet behind an NDA acceptance. */
    requireNda: boolean("require_nda").default(true).notNull(),
    ndaAcceptedAt: timestamp("nda_accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Audit: when the recipient first opened the packet. */
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("reference_shares_owner_idx").on(t.ownerUserId),
    index("reference_shares_token_idx").on(t.token),
  ],
);

export type ReferenceContact = typeof referenceContacts.$inferSelect;
export type NewReferenceContact = typeof referenceContacts.$inferInsert;
export type ReferenceShare = typeof referenceShares.$inferSelect;
export type NewReferenceShare = typeof referenceShares.$inferInsert;
