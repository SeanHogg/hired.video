/**
 * Contacts graph (migration 0493) — people an account owner knows who may or
 * may not be platform users: senders the inbox processor captures, sourcing
 * leads, enriched lookups, manual entries. Enums: shared/contacts.ts.
 *
 * Duplicate people found across contacts land in `person_merge_queue`
 * (taxonomies.ts), honoring `workspace_person_merge_policy`.
 */
import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { jobItems } from "./jobs.js";

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }),
    fullName: varchar("full_name", { length: 255 }),
    company: varchar("company", { length: 255 }),
    title: varchar("title", { length: 255 }),
    phone: varchar("phone", { length: 64 }),
    linkedinUrl: text("linkedin_url"),
    /** Platform account with the same email, linked automatically. */
    linkedUserId: uuid("linked_user_id").references(() => users.id, { onDelete: "set null" }),
    /** contact | lead — CONTACT_LIFECYCLES. */
    lifecycle: varchar("lifecycle", { length: 16 }).default("contact").notNull(),
    /** manual | inbox | enrichment | sourcing — CONTACT_SOURCES. */
    source: varchar("source", { length: 32 }).default("manual").notNull(),
    notes: text("notes"),
    enrichedAt: timestamp("enriched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uqOwnerEmail: uniqueIndex("uq_contacts_owner_email")
      .on(t.ownerUserId, sql`lower(${t.email})`)
      .where(sql`${t.email} IS NOT NULL`),
    idxOwnerUpdated: index("idx_contacts_owner_updated").on(t.ownerUserId, t.updatedAt),
    idxLinkedUser: index("idx_contacts_linked_user").on(t.linkedUserId),
    lifecycleCheck: check("contacts_lifecycle_check", sql`${t.lifecycle} IN ('contact', 'lead')`),
    sourceCheck: check("contacts_source_check", sql`${t.source} IN ('manual', 'inbox', 'enrichment', 'sourcing')`),
  }),
);

export type ContactRow = typeof contacts.$inferSelect;
export type NewContactRow = typeof contacts.$inferInsert;

/** A contact's position in one of the owner's job pipelines. */
export const contactJobLinks = pgTable(
  "contact_job_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").notNull().references(() => jobItems.id, { onDelete: "cascade" }),
    /** CONTACT_JOB_STAGES. */
    stage: varchar("stage", { length: 32 }).default("sourced").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uqContactJob: uniqueIndex("uq_contact_job_links_contact_job").on(t.contactId, t.jobId),
    idxJob: index("idx_contact_job_links_job").on(t.jobId),
    stageCheck: check("contact_job_links_stage_check", sql`${t.stage} IN ('sourced', 'contacted', 'replied', 'interviewing', 'offer', 'hired', 'rejected')`),
  }),
);

export type ContactJobLinkRow = typeof contactJobLinks.$inferSelect;
export type NewContactJobLinkRow = typeof contactJobLinks.$inferInsert;
