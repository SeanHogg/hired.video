import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { requirePro } from "../middleware/tierEnforcement.js";
import { CalendarConnections } from "../services/provider-connections/calendar-connections.js";
import { clampLimit } from "../utils/pagination.js";
import {
  bookInterview,
  createAvailabilitySlot,
  createCalendarEvent,
  deleteAvailabilitySlot,
  deleteCalendarEvent,
  getCalendarEvent,
  listAvailability,
  listCalendarEvents,
  proposeInterviewSlots,
  updateCalendarEvent,
} from "../services/calendar/calendarEventsService.js";
import {
  beginCalendarConnect,
  completeCalendarConnect,
  syncAllCalendarsForUser,
} from "../services/calendar/calendarSyncService.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const calendarRoutes = new Hono<AppEnv>();

const CreateEventSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  timezone: z.string().default("UTC"),
  location: z.string().optional(),
  meetingUrl: z.string().url().optional(),
  type: z.enum(["interview", "meeting", "review", "other"]).default("interview"),
  relatedEntityType: z.enum(["job", "application", "candidate"]).optional(),
  relatedEntityId: UuidLikeSchema.optional(),
  attendees: z.array(z.object({ email: z.string().email(), name: z.string().optional(), status: z.string().optional() })).default([]),
  reminderMinutes: z.array(z.number().int().min(0)).default([30, 1440]),
});

const CreateSlotSchema = z.object({
  dayOfWeek: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().default("UTC"),
});

// ---------------------------------------------------------------------------
// GET /api/calendar/events — upcoming events for the user
// ---------------------------------------------------------------------------
calendarRoutes.get("/events", requirePro("Calendar Integration"), async (c) => {
  const userId = requireUser(c);

  const from = c.req.query("from") ? new Date(c.req.query("from")!) : new Date();
  const to = c.req.query("to") ? new Date(c.req.query("to")!) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  // Hard cap on rows returned: a user with thousands of synced events would
  // otherwise OOM the Worker isolate (128 MB). 500 covers any reasonable
  // 30-day window; callers needing more pass a tighter `from`/`to`. Gap #1337.
  const limit = clampLimit(c.req.query("limit"), 500, 1000);

  return c.json(success(await listCalendarEvents(userId, { from, to, limit })), 200);
});

// ---------------------------------------------------------------------------
// POST /api/calendar/events — create a new scheduled event
// ---------------------------------------------------------------------------
calendarRoutes.post("/events", requirePro("Calendar Integration"), validateJson(CreateEventSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const event = await createCalendarEvent(userId, c.req.valid("json"));
  return c.json(success(event), 201);
});

// ---------------------------------------------------------------------------
// GET /api/calendar/events/:id
// ---------------------------------------------------------------------------
calendarRoutes.get("/events/:id", requirePro("Calendar Integration"), async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getCalendarEvent(userId, c.req.param("id"))), 200);
});

// ---------------------------------------------------------------------------
// PATCH /api/calendar/events/:id
// ---------------------------------------------------------------------------
calendarRoutes.patch("/events/:id", requirePro("Calendar Integration"), async (c) => {
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  return c.json(success(await updateCalendarEvent(userId, c.req.param("id"), body)), 200);
});

// ---------------------------------------------------------------------------
// DELETE /api/calendar/events/:id
// ---------------------------------------------------------------------------
calendarRoutes.delete("/events/:id", requirePro("Calendar Integration"), async (c) => {
  const userId = requireUser(c);
  await deleteCalendarEvent(userId, c.req.param("id"));
  return c.json(success({ deleted: true }), 200);
});

// ---------------------------------------------------------------------------
// Availability Slots
// ---------------------------------------------------------------------------

// GET /api/calendar/availability
calendarRoutes.get("/availability", requirePro("Calendar Integration"), async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listAvailability(userId)), 200);
});

// POST /api/calendar/availability
calendarRoutes.post("/availability", requirePro("Calendar Integration"), validateJson(CreateSlotSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const slot = await createAvailabilitySlot(userId, c.req.valid("json"));
  return c.json(success(slot), 201);
});

// DELETE /api/calendar/availability/:id
calendarRoutes.delete("/availability/:id", requirePro("Calendar Integration"), async (c) => {
  const userId = requireUser(c);
  await deleteAvailabilitySlot(userId, c.req.param("id"));
  return c.json(success({ deleted: true }), 200);
});

// ---------------------------------------------------------------------------
// Calendar Connections (OAuth — stores access tokens)
// ---------------------------------------------------------------------------

// GET /api/calendar/connections
calendarRoutes.get("/connections", requirePro("Calendar Integration"), async (c) => {
  const userId = requireUser(c);
  const connections = await new CalendarConnections().listForUser(userId);
  return c.json(success(connections), 200);
});

// DELETE /api/calendar/connections/:id — disconnect a calendar
calendarRoutes.delete("/connections/:id", requirePro("Calendar Integration"), async (c) => {
  const userId = requireUser(c);
  const disconnected = await new CalendarConnections().disconnect(c.req.param("id"), userId);
  if (!disconnected) return c.json(error("NOT_FOUND", "Calendar connection not found"), 404);
  return c.json(success({ disconnected: true }), 200);
});

// ---------------------------------------------------------------------------
// Google / Outlook OAuth — connect a calendar provider (#11)
// Two-step: /connect/:provider → provider OAuth → /connect/:provider/callback stores tokens.
// ---------------------------------------------------------------------------

/**
 * GET /api/calendar/connect/:provider — redirect to provider OAuth consent screen.
 * ?redirect= sets the frontend URL to return to after connecting.
 */
calendarRoutes.get("/connect/:provider", requirePro("Calendar Integration"), async (c) => {
  const userId = requireUser(c);
  const provider = c.req.param("provider").toLowerCase();
  const redirect = c.req.query("redirect") ?? "/settings/integrations";
  return c.redirect(beginCalendarConnect(userId, provider, redirect));
});

/**
 * GET /api/calendar/connect/:provider/callback — OAuth callback, stores tokens.
 * Public — no auth token in headers (the callback comes from the provider).
 */
calendarRoutes.get("/connect/:provider/callback", async (c) => {
  const target = await completeCalendarConnect({
    provider: c.req.param("provider").toLowerCase(),
    code: c.req.query("code"),
    state: c.req.query("state"),
  });
  return c.redirect(target);
});

/**
 * POST /api/calendar/sync — trigger a two-way sync for the user's connected calendars.
 * Pushes hired.video calendar events to Google/Outlook and pulls back upcoming
 * external events.
 */
calendarRoutes.post("/sync", requirePro("Calendar Integration"), async (c) => {
  const userId = requireUser(c);
  return c.json(success(await syncAllCalendarsForUser(userId)), 200);
});

// ---------------------------------------------------------------------------
// Interview scheduling automation (#28) — real-interview slot booking
// ---------------------------------------------------------------------------

/**
 * POST /api/calendar/interview-slots
 * Body: { interviewSessionId, duration: 30|60, daysAhead: 7 }
 * Proposes open slots from the recruiter's availability windows.
 */
calendarRoutes.post("/interview-slots", requirePro("Interview Scheduling"), async (c) => {
  const userId = requireUser(c);

  const body = await c.req.json().catch(() => ({}));
  const duration = Number(body.duration ?? 30);
  const daysAhead = Math.min(14, Math.max(1, Number(body.daysAhead ?? 7)));

  const slots = await proposeInterviewSlots(userId, duration, daysAhead);
  return c.json(success({ slots, duration, daysAhead }), 200);
});

/**
 * POST /api/calendar/book-interview
 * Confirms a slot and creates a calendar event + notifies both parties.
 * Body: { slot: { start, end }, candidateId, jobTitle, notes? }
 */
calendarRoutes.post("/book-interview", requirePro("Interview Scheduling"), async (c) => {
  const userId = requireUser(c);

  const body = await c.req.json().catch(() => ({}));
  if (!body.slot?.start || !body.slot?.end) return c.json(error("VALIDATION_ERROR", "slot.start and slot.end are required"), 400);

  const { event, synced, backgroundSync } = await bookInterview(userId, body);
  // Calendar sync runs in the background.
  if (backgroundSync) (c.executionCtx as any)?.waitUntil?.(backgroundSync);

  return c.json(success({ event, synced }), 201);
});
