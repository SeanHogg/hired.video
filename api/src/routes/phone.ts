import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import * as sw from "../services/adapters/signalwire.js";
import { parsePagination } from "../utils/pagination.js";
import { readForm } from "../utils/multipart.js";
import { getPhoneBalance, listPhoneBalanceTransactions, setPhoneAutoTopUp } from "../services/phone/phoneWallet.js";
import {
  getMonthlyUsage,
  handleInboundCall,
  handleInboundSms,
  listActiveNumbers,
  listCalls,
  listSms,
  placeOutboundCall,
  provisionNumber,
  releaseNumber,
  sendSms,
  updateNumberSettings,
} from "../services/phone/phoneService.js";
import { success, error } from "../types/index.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const phoneRoutes = new Hono<AppEnv>();

const xml = (body: string) => new Response(body, { headers: { "Content-Type": "application/xml" } });

// ─── Numbers ──────────────────────────────────────────────────────────────────

// GET /api/phone/numbers
phoneRoutes.get("/numbers", async (c) => {
  return c.json(success(await listActiveNumbers(requireUser(c))));
});

// GET /api/phone/numbers/search
phoneRoutes.get("/numbers/search", async (c) => {
  const query = c.req.query();
  const numbers = await sw.searchAvailableNumbers({
    countryCode: query.countryCode,
    areaCode:    query.areaCode,
    contains:    query.contains,
  }).catch(() => []);
  return c.json(success(numbers));
});

const ProvisionSchema = z.object({
  phoneNumber:  z.string().min(10),
  friendlyName: z.string().max(100).optional(),
});

// POST /api/phone/numbers
phoneRoutes.post("/numbers", validateJson(ProvisionSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const userId = requireUser(c);
  const row = await provisionNumber(userId, c.req.valid("json"));
  return c.json(success(row), 201);
});

const UpdateNumberSchema = z.object({
  friendlyName:     z.string().max(100).optional(),
  forwardingNumber: z.string().max(20).nullable().optional(),
  voicemailEnabled: z.boolean().optional(),
  dndSchedule:      z.array(z.object({ day: z.number().int().min(0).max(6), startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(0).max(23) })).nullable().optional(),
  greetingText:     z.string().max(500).nullable().optional(),
});

// PATCH /api/phone/numbers/:id
phoneRoutes.patch("/numbers/:id", validateJson(UpdateNumberSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const userId = requireUser(c);
  const updated = await updateNumberSettings(userId, c.req.param("id"), c.req.valid("json"));
  return c.json(success(updated));
});

// DELETE /api/phone/numbers/:id
phoneRoutes.delete("/numbers/:id", async (c) => {
  await releaseNumber(requireUser(c), c.req.param("id"));
  return c.json(success({ released: true }));
});

// ─── Calls ────────────────────────────────────────────────────────────────────

// GET /api/phone/calls
phoneRoutes.get("/calls", async (c) => {
  const userId = requireUser(c);
  const { limit, offset } = parsePagination(c, { defaultLimit: 50, maxLimit: 100 });
  const calls = await listCalls(userId, { numberId: c.req.query("numberId") || undefined, limit, offset });
  return c.json(success({ calls, total: calls.length }));
});

// ─── Outbound calls (gap #1359 — Loxo-Boost-parity native VoIP) ──────────────
//
// The recruiter extension's "Call via hired.video" toggle hits this
// endpoint so outbound calls flow through SignalWire and get a `callLogs`
// row + (optional) recording — instead of dropping out to the OS dialer
// with no activity-timeline footprint.

const PlaceCallSchema = z.object({
  phoneNumberId: UuidLikeSchema,
  to:            z.string().min(7),
  record:        z.boolean().optional(),
});

phoneRoutes.post("/call", validateJson(PlaceCallSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const userId = requireUser(c);
  const result = await placeOutboundCall(userId, c.req.valid("json"));
  return c.json(success(result), 201);
});

// SignalWire fetches this when an outbound call is answered — we return
// TwiML that bridges to the destination and (optionally) records.
phoneRoutes.post("/webhook/outbound-call", async (c) => {
  const form = await readForm(c);
  const to = form?.get("To")?.toString() ?? "";
  const callerId = form?.get("From")?.toString() ?? null;
  return xml(sw.buildOutboundCallTwiML({ to, record: true, callerId }));
});

// ─── SMS ──────────────────────────────────────────────────────────────────────

// GET /api/phone/sms
phoneRoutes.get("/sms", async (c) => {
  const userId = requireUser(c);
  const { limit, offset } = parsePagination(c, { defaultLimit: 50, maxLimit: 100 });
  const messages = await listSms(userId, {
    numberId:  c.req.query("numberId") || undefined,
    direction: c.req.query("direction") || undefined,
    limit,
    offset,
  });
  return c.json(success({ messages, total: messages.length }));
});

const SendSmsSchema = z.object({
  phoneNumberId: UuidLikeSchema,
  to:            z.string().min(10),
  body:          z.string().min(1).max(1600),
});

// POST /api/phone/sms
phoneRoutes.post("/sms", async (c) => {
  const userId = requireUser(c);
  const body   = await c.req.json().catch(() => ({}));
  const parsed = SendSmsSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.message), 400);
  const msg = await sendSms(userId, parsed.data);
  return c.json(success(msg), 201);
});

// ─── Balance ──────────────────────────────────────────────────────────────────

// GET /api/phone/balance
phoneRoutes.get("/balance", async (c) => {
  const userId = requireUser(c);
  const balance = await getPhoneBalance(userId);
  const transactions = await listPhoneBalanceTransactions(userId, 50);
  return c.json(success({ balance, transactions }));
});

const TopupSchema = z.object({
  amountCents: z.number().int().min(500).max(100000), // $5 – $1,000
});

// POST /api/phone/balance/topup — returns Stripe checkout URL
phoneRoutes.post("/balance/topup", validateJson(TopupSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const body = c.req.valid("json");

  // Stub: in production this creates a Stripe checkout session and returns the URL.
  // The webhook handler then credits the balance on payment.success.
  const dollars = (body.amountCents / 100).toFixed(2);
  return c.json(success({
    checkoutUrl: `https://hired.video/checkout?product=phone_credit&amount=${body.amountCents}`,
    message:     `Top-up for $${dollars} — Stripe checkout integration pending.`,
  }));
});

const AutoTopupSchema = z.object({
  enabled:        z.boolean(),
  thresholdCents: z.number().int().min(100),
  amountCents:    z.number().int().min(500),
});

// PATCH /api/phone/balance/auto-topup
phoneRoutes.patch("/balance/auto-topup", validateJson(AutoTopupSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const updated = await setPhoneAutoTopUp(requireUser(c), c.req.valid("json"));
  return c.json(success(updated));
});

// ─── Usage ────────────────────────────────────────────────────────────────────

// GET /api/phone/usage
phoneRoutes.get("/usage", async (c) => {
  return c.json(success(await getMonthlyUsage(requireUser(c))));
});

// ─── Webhooks (public — no auth) ──────────────────────────────────────────────

// POST /api/phone/webhook/call — SignalWire inbound call
phoneRoutes.post("/webhook/call", async (c) => {
  const formData = await c.req.parseBody().catch(() => ({} as Record<string, string>));
  const twiml = await handleInboundCall({
    to:      String(formData.To      ?? ""),
    from:    String(formData.From    ?? ""),
    callSid: String(formData.CallSid ?? ""),
  });
  return xml(twiml);
});

// POST /api/phone/webhook/sms — SignalWire inbound SMS
phoneRoutes.post("/webhook/sms", async (c) => {
  const formData = await c.req.parseBody().catch(() => ({} as Record<string, string>));
  await handleInboundSms({
    to:     String(formData.To     ?? ""),
    from:   String(formData.From   ?? ""),
    body:   String(formData.Body   ?? ""),
    smsSid: String(formData.SmsSid ?? ""),
  });
  return xml(sw.buildSmsTwiML());
});
