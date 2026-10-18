/**
 * Business Phone use cases — number provisioning/settings, outbound calls
 * and SMS via SignalWire, call/SMS history, monthly usage, and the public
 * SignalWire inbound webhooks. Routes read input and call these; rule
 * violations are DomainErrors (same codes/statuses the routes returned).
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { logger } from "../../lib/logger.js";
import { getEnv } from "../../utils/env.js";
import * as sw from "../adapters/signalwire.js";
import {
  PhoneRepository,
  type CallLogInsert,
  type PhoneNumberPatch,
  type PhoneNumberRow,
} from "../../repositories/phoneRepository.js";

// Plan limits — Pro users get these included per month
const PLAN_MINUTES_INCLUDED = 100;
const PLAN_SMS_INCLUDED      = 100;
const PLAN_NUMBERS_INCLUDED  = 1;

const repo = () => new PhoneRepository(getDb());
const webhookBase = () => getEnv("WEBHOOK_BASE_URL") || getEnv("FRONTEND_URL");

async function requireOwnedNumber(r: PhoneRepository, id: string, userId: string): Promise<PhoneNumberRow> {
  const num = await r.findOwnedNumber(id, userId);
  if (!num) throw new DomainError(404, "NOT_FOUND", "Phone number not found");
  return num;
}

// ─── Numbers ──────────────────────────────────────────────────────────────────

export function listActiveNumbers(userId: string) {
  return repo().listActiveNumbers(userId);
}

export async function provisionNumber(userId: string, input: { phoneNumber: string; friendlyName?: string }) {
  const provisioned = await sw.provisionNumber({ phoneNumber: input.phoneNumber, webhookBase: webhookBase() }).catch((err) => {
    throw new Error(`Failed to provision number: ${err.message}`);
  });
  return repo().insertNumber({
    userId,
    phoneNumber:        provisioned.phoneNumber,
    friendlyName:       input.friendlyName ?? null,
    signalwirePhoneSid: provisioned.sid,
    voicemailEnabled:   true,
    status:             "active",
  });
}

export async function updateNumberSettings(
  userId: string,
  numberId: string,
  body: Omit<PhoneNumberPatch, "status" | "updatedAt">,
) {
  const r = repo();
  await requireOwnedNumber(r, numberId, userId);
  const updates: PhoneNumberPatch = { updatedAt: new Date() };
  if (body.friendlyName     !== undefined) updates.friendlyName     = body.friendlyName;
  if (body.forwardingNumber !== undefined) updates.forwardingNumber = body.forwardingNumber;
  if (body.voicemailEnabled !== undefined) updates.voicemailEnabled = body.voicemailEnabled;
  if (body.dndSchedule      !== undefined) updates.dndSchedule      = body.dndSchedule;
  if (body.greetingText     !== undefined) updates.greetingText     = body.greetingText;
  return r.updateNumber(numberId, updates);
}

export async function releaseNumber(userId: string, numberId: string): Promise<void> {
  const r = repo();
  const num = await requireOwnedNumber(r, numberId, userId);
  if (num.signalwirePhoneSid) {
    await sw.releaseNumber(num.signalwirePhoneSid).catch((err) => {
      logger.error("[phone] SignalWire release failed", { error: err.message });
    });
  }
  await r.updateNumber(numberId, { status: "released", updatedAt: new Date() });
}

// ─── Calls / SMS ──────────────────────────────────────────────────────────────

export async function listCalls(userId: string, opts: { numberId?: string; limit: number; offset: number }) {
  const r = repo();
  const rows = await r.listCalls(userId, opts);
  const numMap = await r.findNumberMap([...new Set(rows.map((x) => x.phoneNumberId))]);
  return rows.map((x) => ({ ...x, phoneNumber: numMap[x.phoneNumberId] ?? null }));
}

export async function placeOutboundCall(userId: string, input: { phoneNumberId: string; to: string; record?: boolean }) {
  const r = repo();
  const num = await requireOwnedNumber(r, input.phoneNumberId, userId);
  const base = webhookBase();
  if (!base) throw new DomainError(500, "CONFIG_ERROR", "WEBHOOK_BASE_URL not configured");

  let result: { sid: string; status: string };
  try {
    result = await sw.placeCall({ from: num.phoneNumber, to: input.to, webhookBase: base, record: input.record ?? true });
  } catch (err: any) {
    throw new DomainError(502, "PROVIDER_ERROR", err?.message ?? "Call failed");
  }

  const call = await r.insertCall({
    userId,
    phoneNumberId: input.phoneNumberId,
    direction:     "outbound",
    callerNumber:  num.phoneNumber,
    calledNumber:  input.to,
    // NOTE: "completed"/"ringing" are not call_status enum values (see report).
    status:        (result.status === "completed" ? "completed" : "ringing") as CallLogInsert["status"],
    signalwireCallSid: result.sid,
  });
  return { call, sid: result.sid, status: result.status };
}

export async function listSms(userId: string, opts: { numberId?: string; direction?: string; limit: number; offset: number }) {
  const r = repo();
  const rows = await r.listSms(userId, opts);
  const numMap = await r.findNumberMap([...new Set(rows.map((x) => x.phoneNumberId))]);
  return rows.map((x) => ({ ...x, phoneNumber: numMap[x.phoneNumberId] ?? null }));
}

export async function sendSms(userId: string, input: { phoneNumberId: string; to: string; body: string }) {
  const r = repo();
  const num = await requireOwnedNumber(r, input.phoneNumberId, userId);
  const sid = await sw.sendSms({ from: num.phoneNumber, to: input.to, body: input.body });
  return r.insertSms({
    userId,
    phoneNumberId: input.phoneNumberId,
    direction:     "outbound",
    fromNumber:    num.phoneNumber,
    toNumber:      input.to,
    body:          input.body,
    status:        "sent",
    signalwireSmsSid: sid,
  });
}

// ─── Usage ────────────────────────────────────────────────────────────────────

/** Current calendar month usage vs the Pro plan's included allowance. */
export async function getMonthlyUsage(userId: string) {
  const r = repo();
  const now         = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  const since = new Date(periodStart);
  const totalSeconds = await r.sumCallSecondsSince(userId, since);
  const smsUsed = await r.countSmsSince(userId, since);
  const numbersActive = await r.countActiveNumbers(userId);
  return {
    minutesUsed:     Math.ceil(totalSeconds / 60),
    minutesIncluded: PLAN_MINUTES_INCLUDED,
    smsUsed,
    smsIncluded:     PLAN_SMS_INCLUDED,
    numbersActive,
    numbersIncluded: PLAN_NUMBERS_INCLUDED,
    periodStart,
    periodEnd,
  };
}

// ─── Inbound webhooks ─────────────────────────────────────────────────────────

const INACTIVE_NUMBER_TWIML =
  `<?xml version="1.0" encoding="UTF-8"?><Response><Say>This number is not currently active.</Say></Response>`;

/** Log an inbound call (DND → missed) and return the TwiML to answer it. */
export async function handleInboundCall(input: { to: string; from: string; callSid: string }): Promise<string> {
  const r = repo();
  const num = await r.findNumberByE164(input.to);
  if (!num) return INACTIVE_NUMBER_TWIML;

  const now  = new Date();
  const dndSchedule = num.dndSchedule as Array<{ day: number; startHour: number; endHour: number }> | null;
  let inDnd = false;
  if (dndSchedule) {
    const day  = now.getDay();
    const hour = now.getHours();
    inDnd = dndSchedule.some((s) => s.day === day && hour >= s.startHour && hour < s.endHour);
  }

  await r.insertCall({
    userId:            num.userId,
    phoneNumberId:     num.id,
    direction:         "inbound",
    callerNumber:      input.from,
    calledNumber:      input.to,
    durationSeconds:   0,
    status:            inDnd ? "missed" : "answered",
    signalwireCallSid: input.callSid,
  }).catch(() => undefined);

  return sw.buildCallTwiML({
    forwardingNumber: inDnd ? null : (num.forwardingNumber ?? null),
    greetingText:     num.greetingText ?? null,
    voicemailEnabled: num.voicemailEnabled,
  });
}

/** Store an inbound SMS for the owning number (unknown numbers are ignored). */
export async function handleInboundSms(input: { to: string; from: string; body: string; smsSid: string }): Promise<void> {
  const r = repo();
  const num = await r.findNumberByE164(input.to);
  if (!num) return;
  await r.insertSms({
    userId:           num.userId,
    phoneNumberId:    num.id,
    direction:        "inbound",
    fromNumber:       input.from,
    toNumber:         input.to,
    body:             input.body,
    status:           "unread",
    signalwireSmsSid: input.smsSid,
  }).catch(() => undefined);
}
