/**
 * Legal Documents — versioned, superadmin-managed terms / policies with
 * per-user acceptance tracking.
 *
 * Tables:
 *   - legalDocuments           — every published version of every legal doc
 *   - legalDocumentAcceptances — per-user acceptance log (snapshots version + IP + UA)
 *
 * Doc kinds (extensible — varchar, not enum):
 *   creator_terms | general_terms | privacy_policy | cookie_policy |
 *   marketplace_buyer_terms | acceptable_use | data_processing
 *
 * One document of each kind may be marked `isCurrent = true` at a time
 * (enforced by partial unique index). Publishing a new version
 * un-currents the previous one transactionally in the route layer.
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const legalDocuments = pgTable(
  "legal_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: varchar("kind", { length: 64 }).notNull(),
    version: varchar("version", { length: 32 }).notNull(), // e.g. "2026-04-07" or "1.2.0"
    title: varchar("title", { length: 255 }).notNull(),
    summary: text("summary"),                                // short blurb shown above the scroller
    body: text("body").notNull(),                            // full markdown body
    locale: varchar("locale", { length: 10 }).default("en").notNull(),

    isCurrent: boolean("is_current").default(false).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Only one current document per (kind, locale) at a time.
    uniqueIndex("uq_legal_documents_current_kind")
      .on(t.kind, t.locale)
      .where(sql`${t.isCurrent} = true`),
    uniqueIndex("uq_legal_documents_kind_version_locale").on(t.kind, t.version, t.locale),
    index("idx_legal_documents_published_by").on(t.publishedBy),
  ],
);

export type LegalDocument = typeof legalDocuments.$inferSelect;
export type NewLegalDocument = typeof legalDocuments.$inferInsert;

export const legalDocumentAcceptances = pgTable(
  "legal_document_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // SET NULL on doc delete — the denormalised snapshots below (kind,
    // version, locale, accepted_at, ip, user_agent) make the acceptance
    // row self-contained, so we can purge an old doc without losing the
    // compliance evidence that the user accepted some version of it.
    documentId: uuid("document_id").references(() => legalDocuments.id, { onDelete: "set null" }),

    // Denormalised snapshots so the acceptance record is self-contained even
    // if the source document is later edited or deleted.
    kind: varchar("kind", { length: 64 }).notNull(),
    version: varchar("version", { length: 32 }).notNull(),
    locale: varchar("locale", { length: 10 }).default("en").notNull(),

    acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),

    // Optional context: which flow triggered the acceptance
    // (e.g. "creator_opt_in", "signup", "checkout").
    context: varchar("context", { length: 64 }),
  },
  (t) => [
    index("idx_legal_acceptances_kind").on(t.kind),
    // A user can accept the same document multiple times (e.g. re-confirm),
    // but the most recent acceptance per (user, kind) is what we surface.
    index("idx_legal_acceptances_user_kind").on(t.userId, t.kind, t.acceptedAt),
    index("idx_legal_document_acceptances_document_id").on(t.documentId),
  ],
);

export type LegalDocumentAcceptance = typeof legalDocumentAcceptances.$inferSelect;
export type NewLegalDocumentAcceptance = typeof legalDocumentAcceptances.$inferInsert;
