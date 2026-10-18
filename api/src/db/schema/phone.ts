import { pgTable, text, varchar, boolean, integer, timestamp, uuid, pgEnum, jsonb, index, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const phoneDirectionEnum = pgEnum("phone_direction", ["inbound", "outbound"]);
export const callStatusEnum = pgEnum("call_status", ["answered", "missed", "voicemail", "busy", "failed"]);
export const smsStatusEnum = pgEnum("sms_status", ["received", "sent", "failed", "unread"]);
export const phoneNumberStatusEnum = pgEnum("phone_number_status", ["active", "suspended", "released"]);
// Kept declared although no live table uses it: the archived
// archive.phone_balance_transactions.type column (0595) still depends on the
// type, and an undeclared enum would make drizzle-kit push try to DROP it.
export const phoneBalanceTxTypeEnum = pgEnum("phone_balance_tx_type", ["purchase", "call_charge", "sms_charge", "refund", "monthly_grant"]);

// Provisioned Business Phone numbers per user
export const businessPhoneNumbers = pgTable("business_phone_numbers", {
  id:                   uuid("id").defaultRandom().primaryKey(),
  userId:               uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  phoneNumber:          varchar("phone_number", { length: 20 }).notNull(),    // E.164
  friendlyName:         varchar("friendly_name", { length: 100 }),
  signalwirePhoneSid:   text("signalwire_phone_sid"),                         // SignalWire resource SID
  forwardingNumber:     varchar("forwarding_number", { length: 20 }),         // where inbound calls are forwarded
  voicemailEnabled:     boolean("voicemail_enabled").default(true).notNull(),
  dndSchedule:          jsonb("dnd_schedule"),                                // [{day:0-6, startHour:0-23, endHour:0-23}]
  greetingText:         text("greeting_text"),                                // TTS greeting played before forwarding
  status:               phoneNumberStatusEnum("status").default("active").notNull(),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("bpn_user_idx").on(t.userId),
  index("bpn_number_idx").on(t.phoneNumber),
]);

// Call log — one row per call leg
export const callLogs = pgTable("call_logs", {
  id:                   uuid("id").defaultRandom().primaryKey(),
  userId:               uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  phoneNumberId:        uuid("phone_number_id").notNull(),
  direction:            phoneDirectionEnum("direction").notNull(),
  callerNumber:         varchar("caller_number", { length: 20 }).notNull(),
  calledNumber:         varchar("called_number", { length: 20 }).notNull(),
  durationSeconds:      integer("duration_seconds").default(0).notNull(),
  recordingUrl:         text("recording_url"),
  status:               callStatusEnum("status").notNull(),
  signalwireCallSid:    text("signalwire_call_sid"),
  notes:                text("notes"),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("cl_number_idx").on(t.phoneNumberId),
  index("cl_created_idx").on(t.createdAt),
  index("idx_call_logs_user_created").on(t.userId, t.createdAt.desc()),
  // SignalWire webhook idempotency — re-delivered events for the same
  // call_sid must not double-log.
  uniqueIndex("uq_call_logs_signalwire_sid")
    .on(t.signalwireCallSid)
    .where(sql`${t.signalwireCallSid} IS NOT NULL`),
]);

// SMS messages (inbound + outbound)
export const smsMessages = pgTable("sms_messages", {
  id:                   uuid("id").defaultRandom().primaryKey(),
  userId:               uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  phoneNumberId:        uuid("phone_number_id").notNull(),
  direction:            phoneDirectionEnum("direction").notNull(),
  fromNumber:           varchar("from_number", { length: 20 }).notNull(),
  toNumber:             varchar("to_number", { length: 20 }).notNull(),
  body:                 text("body").notNull(),
  status:               smsStatusEnum("status").notNull(),
  signalwireSmsSid:     text("signalwire_sms_sid"),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("sms_number_idx").on(t.phoneNumberId),
  index("sms_created_idx").on(t.createdAt),
  index("idx_sms_messages_user_created").on(t.userId, t.createdAt.desc()),
  uniqueIndex("uq_sms_messages_signalwire_sid")
    .on(t.signalwireSmsSid)
    .where(sql`${t.signalwireSmsSid} IS NOT NULL`),
]);

// The per-user prepaid phone balance and its transaction ledger are the
// `phone_cents` wallet (wallets.ts — W3-B, migration 0590).
