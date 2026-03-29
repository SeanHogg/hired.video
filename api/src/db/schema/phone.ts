import { pgTable, text, varchar, boolean, integer, timestamp, uuid, pgEnum, jsonb, index, unique } from "drizzle-orm/pg-core";

export const phoneDirectionEnum = pgEnum("phone_direction", ["inbound", "outbound"]);
export const callStatusEnum = pgEnum("call_status", ["answered", "missed", "voicemail", "busy", "failed"]);
export const smsStatusEnum = pgEnum("sms_status", ["received", "sent", "failed", "unread"]);
export const phoneNumberStatusEnum = pgEnum("phone_number_status", ["active", "suspended", "released"]);
export const phoneBalanceTxTypeEnum = pgEnum("phone_balance_tx_type", ["purchase", "call_charge", "sms_charge", "refund", "monthly_grant"]);

// Provisioned Business Phone numbers per user
export const businessPhoneNumbers = pgTable("business_phone_numbers", {
  id:                   uuid("id").defaultRandom().primaryKey(),
  userId:               text("user_id").notNull(),
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
  userId:               text("user_id").notNull(),
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
  index("cl_user_idx").on(t.userId),
  index("cl_number_idx").on(t.phoneNumberId),
  index("cl_created_idx").on(t.createdAt),
]);

// SMS messages (inbound + outbound)
export const smsMessages = pgTable("sms_messages", {
  id:                   uuid("id").defaultRandom().primaryKey(),
  userId:               text("user_id").notNull(),
  phoneNumberId:        uuid("phone_number_id").notNull(),
  direction:            phoneDirectionEnum("direction").notNull(),
  fromNumber:           varchar("from_number", { length: 20 }).notNull(),
  toNumber:             varchar("to_number", { length: 20 }).notNull(),
  body:                 text("body").notNull(),
  status:               smsStatusEnum("status").notNull(),
  signalwireSmsSid:     text("signalwire_sms_sid"),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("sms_user_idx").on(t.userId),
  index("sms_number_idx").on(t.phoneNumberId),
  index("sms_created_idx").on(t.createdAt),
]);

// Per-user prepaid balance for phone usage overage
export const phoneBalances = pgTable("phone_balances", {
  id:                       uuid("id").defaultRandom().primaryKey(),
  userId:                   text("user_id").notNull(),
  balanceCents:             integer("balance_cents").default(0).notNull(),
  autoTopUpEnabled:         boolean("auto_top_up_enabled").default(false).notNull(),
  autoTopUpThresholdCents:  integer("auto_top_up_threshold_cents").default(500).notNull(),  // top-up when balance < $5
  autoTopUpAmountCents:     integer("auto_top_up_amount_cents").default(2000).notNull(),    // top-up by $20
  updatedAt:                timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("pb_user_unique").on(t.userId),
]);

// Transaction ledger for phone balance
export const phoneBalanceTransactions = pgTable("phone_balance_transactions", {
  id:                   uuid("id").defaultRandom().primaryKey(),
  userId:               text("user_id").notNull(),
  type:                 phoneBalanceTxTypeEnum("type").notNull(),
  amountCents:          integer("amount_cents").notNull(),   // positive = credit, negative = debit
  balanceCentsAfter:    integer("balance_cents_after").notNull(),
  description:          text("description"),
  referenceId:          text("reference_id"),                // call/sms id or Stripe payment intent
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("pbt_user_idx").on(t.userId),
  index("pbt_created_idx").on(t.createdAt),
]);
