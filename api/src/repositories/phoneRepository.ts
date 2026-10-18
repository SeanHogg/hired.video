/**
 * PhoneRepository — the Business Phone aggregate: provisioned numbers
 * (`business_phone_numbers`), their call log (`call_logs`) and SMS log
 * (`sms_messages`). The prepaid balance is the `phone_cents` wallet
 * (walletRepository), not here.
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { businessPhoneNumbers, callLogs, smsMessages } = schema;

export type PhoneNumberRow = typeof businessPhoneNumbers.$inferSelect;
export type PhoneNumberInsert = typeof businessPhoneNumbers.$inferInsert;
export type PhoneNumberPatch = Partial<Pick<PhoneNumberInsert,
  "friendlyName" | "forwardingNumber" | "voicemailEnabled" | "dndSchedule" | "greetingText" | "status" | "updatedAt">>;
export type CallLogRow = typeof callLogs.$inferSelect;
export type CallLogInsert = typeof callLogs.$inferInsert;
export type SmsMessageRow = typeof smsMessages.$inferSelect;
export type SmsMessageInsert = typeof smsMessages.$inferInsert;

export interface IPhoneRepository {
  listActiveNumbers(userId: string): Promise<PhoneNumberRow[]>;
  findOwnedNumber(id: string, userId: string): Promise<PhoneNumberRow | null>;
  findNumberByE164(phoneNumber: string): Promise<PhoneNumberRow | null>;
  /** id → E.164 for the given number ids (one query). */
  findNumberMap(ids: string[]): Promise<Record<string, string>>;
  insertNumber(input: PhoneNumberInsert): Promise<PhoneNumberRow>;
  updateNumber(id: string, patch: PhoneNumberPatch): Promise<PhoneNumberRow | undefined>;
  listCalls(userId: string, opts: { numberId?: string; limit: number; offset: number }): Promise<CallLogRow[]>;
  insertCall(input: CallLogInsert): Promise<CallLogRow>;
  listSms(userId: string, opts: { numberId?: string; direction?: string; limit: number; offset: number }): Promise<SmsMessageRow[]>;
  insertSms(input: SmsMessageInsert): Promise<SmsMessageRow>;
  sumCallSecondsSince(userId: string, since: Date): Promise<number>;
  countSmsSince(userId: string, since: Date): Promise<number>;
  countActiveNumbers(userId: string): Promise<number>;
}

export class PhoneRepository implements IPhoneRepository {
  constructor(private readonly db: Db) {}

  async listActiveNumbers(userId: string): Promise<PhoneNumberRow[]> {
    return this.db.select().from(businessPhoneNumbers)
      .where(and(eq(businessPhoneNumbers.userId, userId), eq(businessPhoneNumbers.status, "active")))
      .orderBy(desc(businessPhoneNumbers.createdAt));
  }

  async findOwnedNumber(id: string, userId: string): Promise<PhoneNumberRow | null> {
    const [row] = await this.db.select().from(businessPhoneNumbers)
      .where(and(eq(businessPhoneNumbers.id, id), eq(businessPhoneNumbers.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async findNumberByE164(phoneNumber: string): Promise<PhoneNumberRow | null> {
    const [row] = await this.db.select().from(businessPhoneNumbers)
      .where(eq(businessPhoneNumbers.phoneNumber, phoneNumber))
      .limit(1);
    return row ?? null;
  }

  async findNumberMap(ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const rows = await this.db.select({ id: businessPhoneNumbers.id, phoneNumber: businessPhoneNumbers.phoneNumber })
      .from(businessPhoneNumbers)
      .where(inArray(businessPhoneNumbers.id, ids));
    return Object.fromEntries(rows.map((n) => [n.id, n.phoneNumber]));
  }

  async insertNumber(input: PhoneNumberInsert): Promise<PhoneNumberRow> {
    const [row] = await this.db.insert(businessPhoneNumbers).values(input).returning();
    return row;
  }

  async updateNumber(id: string, patch: PhoneNumberPatch): Promise<PhoneNumberRow | undefined> {
    const [row] = await this.db.update(businessPhoneNumbers)
      .set(patch)
      .where(eq(businessPhoneNumbers.id, id))
      .returning();
    return row;
  }

  async listCalls(userId: string, opts: { numberId?: string; limit: number; offset: number }): Promise<CallLogRow[]> {
    const conditions = [eq(callLogs.userId, userId)];
    if (opts.numberId) conditions.push(eq(callLogs.phoneNumberId, opts.numberId));
    return this.db.select().from(callLogs)
      .where(and(...conditions))
      .orderBy(desc(callLogs.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async insertCall(input: CallLogInsert): Promise<CallLogRow> {
    const [row] = await this.db.insert(callLogs).values(input).returning();
    return row;
  }

  async listSms(userId: string, opts: { numberId?: string; direction?: string; limit: number; offset: number }): Promise<SmsMessageRow[]> {
    const conditions = [eq(smsMessages.userId, userId)];
    if (opts.numberId) conditions.push(eq(smsMessages.phoneNumberId, opts.numberId));
    if (opts.direction) conditions.push(eq(smsMessages.direction, opts.direction as SmsMessageRow["direction"]));
    return this.db.select().from(smsMessages)
      .where(and(...conditions))
      .orderBy(desc(smsMessages.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async insertSms(input: SmsMessageInsert): Promise<SmsMessageRow> {
    const [row] = await this.db.insert(smsMessages).values(input).returning();
    return row;
  }

  async sumCallSecondsSince(userId: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ totalSeconds: sql<number>`coalesce(sum(duration_seconds), 0)::int` })
      .from(callLogs)
      .where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, since)));
    return row?.totalSeconds ?? 0;
  }

  async countSmsSince(userId: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(smsMessages)
      .where(and(eq(smsMessages.userId, userId), gte(smsMessages.createdAt, since)));
    return row?.count ?? 0;
  }

  async countActiveNumbers(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(businessPhoneNumbers)
      .where(and(eq(businessPhoneNumbers.userId, userId), eq(businessPhoneNumbers.status, "active")));
    return row?.count ?? 0;
  }
}
