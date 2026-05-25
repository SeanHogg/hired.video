import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Variables, AppEnv } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import * as sw from "../services/adapters/signalwire.js";

export const phoneRoutes = new Hono<AppEnv>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(c: any): string { return c.var.user?.sub as string; }
function ok<T>(data: T) { return { success: true as const, data }; }
function fail(code: string, message: string) { return { success: false as const, error: { code, message } }; }

// Plan limits — Pro users get these included per month
const PLAN_MINUTES_INCLUDED = 100;
const PLAN_SMS_INCLUDED      = 100;
const PLAN_NUMBERS_INCLUDED  = 1;

// ─── Balance helpers ───────────────────────────────────────────────────────────

async function getOrCreateBalance(userId: string) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.phoneBalances)
    .where(eq(schema.phoneBalances.userId, userId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(schema.phoneBalances)
    .values({ userId, balanceCents: 0 } as any)
    .returning();
  return created;
}

async function deductBalance(userId: string, amountCents: number, description: string, referenceId?: string) {
  const db = getDb();
  const balance = await getOrCreateBalance(userId);
  const newBalance = balance.balanceCents - amountCents;
  await db.update(schema.phoneBalances)
    .set({ balanceCents: newBalance, updatedAt: new Date().toISOString() } as any)
    .where(eq(schema.phoneBalances.userId, userId));
  await db.insert(schema.phoneBalanceTransactions).values({
    userId,
    type: amountCents > 0 ? "call_charge" : "refund",
    amountCents: -amountCents,
    balanceCentsAfter: newBalance,
    description,
    referenceId: referenceId ?? null,
  } as any);
  return newBalance;
}

// ─── Numbers ──────────────────────────────────────────────────────────────────

// GET /api/phone/numbers
phoneRoutes.get("/numbers", async (c) => {
  const userId = uid(c);
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.businessPhoneNumbers)
    .where(and(
      eq(schema.businessPhoneNumbers.userId, userId),
      eq(schema.businessPhoneNumbers.status, "active"),
    ))
    .orderBy(desc(schema.businessPhoneNumbers.createdAt));
  return c.json(ok(rows));
});

// GET /api/phone/numbers/search
phoneRoutes.get("/numbers/search", async (c) => {
  const query = c.req.query();
  const numbers = await sw.searchAvailableNumbers({
    countryCode: query.countryCode,
    areaCode:    query.areaCode,
    contains:    query.contains,
  }).catch(() => []);
  return c.json(ok(numbers));
});

const ProvisionSchema = z.object({
  phoneNumber:  z.string().min(10),
  friendlyName: z.string().max(100).optional(),
});

// POST /api/phone/numbers
phoneRoutes.post("/numbers", async (c) => {
  const userId = uid(c);
  const body   = await c.req.json().catch(() => ({}));
  const parsed = ProvisionSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", parsed.error.message), 400);

  const { phoneNumber, friendlyName } = parsed.data;
  const db = getDb();

  // Check existing active numbers (1 included on Pro, additional $2/mo)
  const existing = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.businessPhoneNumbers)
    .where(and(eq(schema.businessPhoneNumbers.userId, userId), eq(schema.businessPhoneNumbers.status, "active")));
  const activeCount = existing[0]?.count ?? 0;

  // Provision via SignalWire
  const webhookBase = (globalThis as any).__ENV?.WEBHOOK_BASE_URL ||
                      process.env.WEBHOOK_BASE_URL ||
                      (globalThis as any).__ENV?.FRONTEND_URL ||
                      process.env.FRONTEND_URL || "";

  const provisioned = await sw.provisionNumber({ phoneNumber, webhookBase }).catch((err) => {
    throw new Error(`Failed to provision number: ${err.message}`);
  });

  const [row] = await db.insert(schema.businessPhoneNumbers).values({
    userId,
    phoneNumber:          provisioned.phoneNumber,
    friendlyName:         friendlyName ?? null,
    signalwirePhoneSid:   provisioned.sid,
    voicemailEnabled:     true,
    status:               "active",
  } as any).returning();

  return c.json(ok(row), 201);
});

const UpdateNumberSchema = z.object({
  friendlyName:     z.string().max(100).optional(),
  forwardingNumber: z.string().max(20).nullable().optional(),
  voicemailEnabled: z.boolean().optional(),
  dndSchedule:      z.array(z.object({ day: z.number().int().min(0).max(6), startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(0).max(23) })).nullable().optional(),
  greetingText:     z.string().max(500).nullable().optional(),
});

// PATCH /api/phone/numbers/:id
phoneRoutes.patch("/numbers/:id", async (c) => {
  const userId = uid(c);
  const numberId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = UpdateNumberSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", parsed.error.message), 400);

  const db = getDb();
  const [num] = await db
    .select()
    .from(schema.businessPhoneNumbers)
    .where(and(eq(schema.businessPhoneNumbers.id, numberId), eq(schema.businessPhoneNumbers.userId, userId)))
    .limit(1);
  if (!num) return c.json(fail("NOT_FOUND", "Phone number not found"), 404);

  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (parsed.data.friendlyName     !== undefined) updates.friendlyName     = parsed.data.friendlyName;
  if (parsed.data.forwardingNumber !== undefined) updates.forwardingNumber = parsed.data.forwardingNumber;
  if (parsed.data.voicemailEnabled !== undefined) updates.voicemailEnabled = parsed.data.voicemailEnabled;
  if (parsed.data.dndSchedule      !== undefined) updates.dndSchedule      = parsed.data.dndSchedule;
  if (parsed.data.greetingText     !== undefined) updates.greetingText     = parsed.data.greetingText;

  const [updated] = await db
    .update(schema.businessPhoneNumbers)
    .set(updates)
    .where(eq(schema.businessPhoneNumbers.id, numberId))
    .returning();
  return c.json(ok(updated));
});

// DELETE /api/phone/numbers/:id
phoneRoutes.delete("/numbers/:id", async (c) => {
  const userId = uid(c);
  const numberId = c.req.param("id");
  const db = getDb();

  const [num] = await db
    .select()
    .from(schema.businessPhoneNumbers)
    .where(and(eq(schema.businessPhoneNumbers.id, numberId), eq(schema.businessPhoneNumbers.userId, userId)))
    .limit(1);
  if (!num) return c.json(fail("NOT_FOUND", "Phone number not found"), 404);

  if (num.signalwirePhoneSid) {
    await sw.releaseNumber(num.signalwirePhoneSid).catch((err) => {
      console.error("SignalWire release failed:", err.message);
    });
  }

  await db
    .update(schema.businessPhoneNumbers)
    .set({ status: "released", updatedAt: new Date().toISOString() } as any)
    .where(eq(schema.businessPhoneNumbers.id, numberId));

  return c.json(ok({ released: true }));
});

// ─── Calls ────────────────────────────────────────────────────────────────────

// GET /api/phone/calls
phoneRoutes.get("/calls", async (c) => {
  const userId = uid(c);
  const query  = c.req.query();
  const limit  = Math.min(parseInt(query.limit ?? "50"), 100);
  const offset = parseInt(query.offset ?? "0");
  const db     = getDb();

  const conditions = [eq(schema.callLogs.userId, userId)];
  if (query.numberId) conditions.push(eq(schema.callLogs.phoneNumberId, query.numberId));

  const rows = await db
    .select()
    .from(schema.callLogs)
    .where(and(...conditions))
    .orderBy(desc(schema.callLogs.createdAt))
    .limit(limit)
    .offset(offset);

  // Enrich with phone number
  const numIds = [...new Set(rows.map((r) => r.phoneNumberId))];
  const nums   = numIds.length > 0
    ? await db.select().from(schema.businessPhoneNumbers).where(
        inArray(schema.businessPhoneNumbers.id, numIds),
      )
    : [];
  const numMap: Record<string, string> = Object.fromEntries(nums.map((n) => [n.id, n.phoneNumber]));

  const calls = rows.map((r) => ({ ...r, phoneNumber: numMap[r.phoneNumberId] ?? null }));
  return c.json(ok({ calls, total: calls.length }));
});

// ─── SMS ──────────────────────────────────────────────────────────────────────

// GET /api/phone/sms
phoneRoutes.get("/sms", async (c) => {
  const userId = uid(c);
  const query  = c.req.query();
  const limit  = Math.min(parseInt(query.limit ?? "50"), 100);
  const offset = parseInt(query.offset ?? "0");
  const db     = getDb();

  const conditions = [eq(schema.smsMessages.userId, userId)];
  if (query.numberId)  conditions.push(eq(schema.smsMessages.phoneNumberId, query.numberId));
  if (query.direction) conditions.push(eq(schema.smsMessages.direction, query.direction as any));

  const rows = await db
    .select()
    .from(schema.smsMessages)
    .where(and(...conditions))
    .orderBy(desc(schema.smsMessages.createdAt))
    .limit(limit)
    .offset(offset);

  const numIds = [...new Set(rows.map((r) => r.phoneNumberId))];
  const nums   = numIds.length > 0
    ? await db.select().from(schema.businessPhoneNumbers).where(
        inArray(schema.businessPhoneNumbers.id, numIds),
      )
    : [];
  const numMap: Record<string, string> = Object.fromEntries(nums.map((n) => [n.id, n.phoneNumber]));

  const messages = rows.map((r) => ({ ...r, phoneNumber: numMap[r.phoneNumberId] ?? null }));
  return c.json(ok({ messages, total: messages.length }));
});

const SendSmsSchema = z.object({
  phoneNumberId: z.string().uuid(),
  to:            z.string().min(10),
  body:          z.string().min(1).max(1600),
});

// POST /api/phone/sms
phoneRoutes.post("/sms", async (c) => {
  const userId = uid(c);
  const body   = await c.req.json().catch(() => ({}));
  const parsed = SendSmsSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", parsed.error.message), 400);

  const db = getDb();
  const [num] = await db
    .select()
    .from(schema.businessPhoneNumbers)
    .where(and(eq(schema.businessPhoneNumbers.id, parsed.data.phoneNumberId), eq(schema.businessPhoneNumbers.userId, userId)))
    .limit(1);
  if (!num) return c.json(fail("NOT_FOUND", "Phone number not found"), 404);

  const sid = await sw.sendSms({ from: num.phoneNumber, to: parsed.data.to, body: parsed.data.body });

  const [msg] = await db.insert(schema.smsMessages).values({
    userId,
    phoneNumberId: parsed.data.phoneNumberId,
    direction:     "outbound",
    fromNumber:    num.phoneNumber,
    toNumber:      parsed.data.to,
    body:          parsed.data.body,
    status:        "sent",
    signalwireSmsSid: sid,
  } as any).returning();

  return c.json(ok(msg), 201);
});

// ─── Balance ──────────────────────────────────────────────────────────────────

// GET /api/phone/balance
phoneRoutes.get("/balance", async (c) => {
  const userId = uid(c);
  const db     = getDb();
  const balance = await getOrCreateBalance(userId);
  const transactions = await db
    .select()
    .from(schema.phoneBalanceTransactions)
    .where(eq(schema.phoneBalanceTransactions.userId, userId))
    .orderBy(desc(schema.phoneBalanceTransactions.createdAt))
    .limit(50);
  return c.json(ok({ balance, transactions }));
});

const TopupSchema = z.object({
  amountCents: z.number().int().min(500).max(100000), // $5 – $1,000
});

// POST /api/phone/balance/topup — returns Stripe checkout URL
phoneRoutes.post("/balance/topup", async (c) => {
  const userId = uid(c);
  const body   = await c.req.json().catch(() => ({}));
  const parsed = TopupSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", parsed.error.message), 400);

  // Stub: in production this creates a Stripe checkout session and returns the URL.
  // The webhook handler then credits the balance on payment.success.
  const dollars = (parsed.data.amountCents / 100).toFixed(2);
  return c.json(ok({
    checkoutUrl: `https://hired.video/checkout?product=phone_credit&amount=${parsed.data.amountCents}`,
    message:     `Top-up for $${dollars} — Stripe checkout integration pending.`,
  }));
});

const AutoTopupSchema = z.object({
  enabled:        z.boolean(),
  thresholdCents: z.number().int().min(100),
  amountCents:    z.number().int().min(500),
});

// PATCH /api/phone/balance/auto-topup
phoneRoutes.patch("/balance/auto-topup", async (c) => {
  const userId = uid(c);
  const body   = await c.req.json().catch(() => ({}));
  const parsed = AutoTopupSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", parsed.error.message), 400);

  const db = getDb();
  await getOrCreateBalance(userId);
  const [updated] = await db
    .update(schema.phoneBalances)
    .set({
      autoTopUpEnabled:        parsed.data.enabled,
      autoTopUpThresholdCents: parsed.data.thresholdCents,
      autoTopUpAmountCents:    parsed.data.amountCents,
      updatedAt:               new Date().toISOString(),
    } as any)
    .where(eq(schema.phoneBalances.userId, userId))
    .returning();
  return c.json(ok(updated));
});

// ─── Usage ────────────────────────────────────────────────────────────────────

// GET /api/phone/usage
phoneRoutes.get("/usage", async (c) => {
  const userId = uid(c);
  const db     = getDb();

  // Current calendar month window
  const now        = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const [callAgg] = await db
    .select({ totalSeconds: sql<number>`coalesce(sum(duration_seconds), 0)::int` })
    .from(schema.callLogs)
    .where(and(
      eq(schema.callLogs.userId, userId),
      gte(schema.callLogs.createdAt, new Date(periodStart)),
    ));

  const [smsAgg] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.smsMessages)
    .where(and(
      eq(schema.smsMessages.userId, userId),
      gte(schema.smsMessages.createdAt, new Date(periodStart)),
    ));

  const [numAgg] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.businessPhoneNumbers)
    .where(and(
      eq(schema.businessPhoneNumbers.userId, userId),
      eq(schema.businessPhoneNumbers.status, "active"),
    ));

  const minutesUsed = Math.ceil((callAgg?.totalSeconds ?? 0) / 60);

  return c.json(ok({
    minutesUsed,
    minutesIncluded: PLAN_MINUTES_INCLUDED,
    smsUsed:         smsAgg?.count ?? 0,
    smsIncluded:     PLAN_SMS_INCLUDED,
    numbersActive:   numAgg?.count ?? 0,
    numbersIncluded: PLAN_NUMBERS_INCLUDED,
    periodStart,
    periodEnd,
  }));
});

// ─── Webhooks (public — no auth) ──────────────────────────────────────────────

// POST /api/phone/webhook/call — SignalWire inbound call
phoneRoutes.post("/webhook/call", async (c) => {
  const formData = await c.req.parseBody().catch(() => ({} as Record<string, string>));
  const to         = String(formData.To   ?? "");
  const from       = String(formData.From ?? "");
  const callSid    = String(formData.CallSid ?? "");

  const db = getDb();
  const [num] = await db
    .select()
    .from(schema.businessPhoneNumbers)
    .where(eq(schema.businessPhoneNumbers.phoneNumber, to))
    .limit(1);

  if (!num) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>This number is not currently active.</Say></Response>`,
      { headers: { "Content-Type": "application/xml" } },
    );
  }

  // Check DND
  const now  = new Date();
  const dndSchedule = num.dndSchedule as Array<{ day: number; startHour: number; endHour: number }> | null;
  let inDnd = false;
  if (dndSchedule) {
    const day  = now.getDay();
    const hour = now.getHours();
    inDnd = dndSchedule.some((s) => s.day === day && hour >= s.startHour && hour < s.endHour);
  }

  // Log the call
  await db.insert(schema.callLogs).values({
    userId:           num.userId,
    phoneNumberId:    num.id,
    direction:        "inbound",
    callerNumber:     from,
    calledNumber:     to,
    durationSeconds:  0,
    status:           inDnd ? "missed" : "answered",
    signalwireCallSid: callSid,
  } as any).catch(() => undefined);

  const twiml = sw.buildCallTwiML({
    forwardingNumber: inDnd ? null : (num.forwardingNumber ?? null),
    greetingText:     num.greetingText ?? null,
    voicemailEnabled: num.voicemailEnabled,
  });

  return new Response(twiml, { headers: { "Content-Type": "application/xml" } });
});

// POST /api/phone/webhook/sms — SignalWire inbound SMS
phoneRoutes.post("/webhook/sms", async (c) => {
  const formData = await c.req.parseBody().catch(() => ({} as Record<string, string>));
  const to     = String(formData.To   ?? "");
  const from   = String(formData.From ?? "");
  const body   = String(formData.Body ?? "");
  const smsSid = String(formData.SmsSid ?? "");

  const db = getDb();
  const [num] = await db
    .select()
    .from(schema.businessPhoneNumbers)
    .where(eq(schema.businessPhoneNumbers.phoneNumber, to))
    .limit(1);

  if (num) {
    await db.insert(schema.smsMessages).values({
      userId:           num.userId,
      phoneNumberId:    num.id,
      direction:        "inbound",
      fromNumber:       from,
      toNumber:         to,
      body,
      status:           "unread",
      signalwireSmsSid: smsSid,
    } as any).catch(() => undefined);
  }

  return new Response(sw.buildSmsTwiML(), { headers: { "Content-Type": "application/xml" } });
});
