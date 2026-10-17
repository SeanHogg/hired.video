// webauthn.ts — FIDO2/WebAuthn credential storage.
// Each row represents one passkey (authenticator) registered by a user.

import { pgTable, uuid, text, varchar, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const webauthnCredentials = pgTable("webauthn_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Base64URL-encoded credential ID assigned by the authenticator
  credentialId: text("credential_id").notNull().unique(),
  // COSE-encoded public key stored as base64url
  publicKey: text("public_key").notNull(),
  // Authenticator AAGUID (identifies device model)
  aaguid: varchar("aaguid", { length: 36 }),
  // COSE algorithm identifier (-7 = ES256, -257 = RS256)
  algorithm: integer("algorithm").notNull().default(-7),
  // Monotonically increasing counter to detect cloned authenticators
  signCount: integer("sign_count").notNull().default(0),
  // Human-readable name set by the user
  name: varchar("name", { length: 100 }).default("My Passkey").notNull(),
  // Whether this credential is backed up (multi-device passkey)
  isBackedUp: boolean("is_backed_up").default(false).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_webauthn_credentials_user_id").on(t.userId),
]);

export type WebAuthnCredential = typeof webauthnCredentials.$inferSelect;
export type NewWebAuthnCredential = typeof webauthnCredentials.$inferInsert;

// Temporary challenges (TTL enforced in application layer)
export const webauthnChallenges = pgTable("webauthn_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  challenge: text("challenge").notNull().unique(),
  type: varchar("type", { length: 20 }).notNull(), // "registration" | "authentication"
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_webauthn_challenges_user_id").on(t.userId),
]);

export type WebAuthnChallenge = typeof webauthnChallenges.$inferSelect;
