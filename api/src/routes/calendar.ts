import { Hono } from "hono";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requirePremium } from "../middleware/tierEnforcement.js";

export const calendarRoutes = new Hono<{ Variables: Variables }>();

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
  relatedEntityId: z.string().uuid().optional(),
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
calendarRoutes.get("/events", requirePremium("Calendar Integration"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const from = c.req.query("from") ? new Date(c.req.query("from")!) : new Date();
  const to = c.req.query("to") ? new Date(c.req.query("to")!) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const events = await db
    .select()
    .from(schema.scheduledEvents)
    .where(
      and(
        eq(schema.scheduledEvents.userId, userId),
        gte(schema.scheduledEvents.startAt, from),
        lte(schema.scheduledEvents.startAt, to),
      ),
    )
    .orderBy(schema.scheduledEvents.startAt);

  return c.json(success(events), 200);
});

// ---------------------------------------------------------------------------
// POST /api/calendar/events — create a new scheduled event
// ---------------------------------------------------------------------------
calendarRoutes.post("/events", requirePremium("Calendar Integration"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateEventSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const db = getDb();
  const [event] = await db
    .insert(schema.scheduledEvents)
    .values({
      userId,
      title: parsed.data.title,
      description: parsed.data.description,
      startAt: new Date(parsed.data.startAt),
      endAt: new Date(parsed.data.endAt),
      timezone: parsed.data.timezone,
      location: parsed.data.location,
      meetingUrl: parsed.data.meetingUrl,
      type: parsed.data.type,
      relatedEntityType: parsed.data.relatedEntityType,
      relatedEntityId: parsed.data.relatedEntityId,
      attendees: parsed.data.attendees,
      reminderMinutes: parsed.data.reminderMinutes,
      status: "confirmed",
      syncedToCalendar: false,
    })
    .returning();

  return c.json(success(event), 201);
});

// ---------------------------------------------------------------------------
// GET /api/calendar/events/:id
// ---------------------------------------------------------------------------
calendarRoutes.get("/events/:id", requirePremium("Calendar Integration"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [event] = await db
    .select()
    .from(schema.scheduledEvents)
    .where(and(eq(schema.scheduledEvents.id, c.req.param("id")), eq(schema.scheduledEvents.userId, userId)))
    .limit(1);

  if (!event) return c.json(error("NOT_FOUND", "Event not found"), 404);
  return c.json(success(event), 200);
});

// ---------------------------------------------------------------------------
// PATCH /api/calendar/events/:id
// ---------------------------------------------------------------------------
calendarRoutes.patch("/events/:id", requirePremium("Calendar Integration"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [event] = await db
    .select({ id: schema.scheduledEvents.id })
    .from(schema.scheduledEvents)
    .where(and(eq(schema.scheduledEvents.id, c.req.param("id")), eq(schema.scheduledEvents.userId, userId)))
    .limit(1);

  if (!event) return c.json(error("NOT_FOUND", "Event not found"), 404);

  const body = await c.req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title) updates.title = body.title;
  if (body.startAt) updates.startAt = new Date(body.startAt);
  if (body.endAt) updates.endAt = new Date(body.endAt);
  if (body.location !== undefined) updates.location = body.location;
  if (body.meetingUrl !== undefined) updates.meetingUrl = body.meetingUrl;
  if (body.status) updates.status = body.status;
  if (body.attendees) updates.attendees = body.attendees;

  const [updated] = await db
    .update(schema.scheduledEvents)
    .set(updates as any)
    .where(eq(schema.scheduledEvents.id, event.id))
    .returning();

  return c.json(success(updated), 200);
});

// ---------------------------------------------------------------------------
// DELETE /api/calendar/events/:id
// ---------------------------------------------------------------------------
calendarRoutes.delete("/events/:id", requirePremium("Calendar Integration"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [event] = await db
    .select({ id: schema.scheduledEvents.id })
    .from(schema.scheduledEvents)
    .where(and(eq(schema.scheduledEvents.id, c.req.param("id")), eq(schema.scheduledEvents.userId, userId)))
    .limit(1);

  if (!event) return c.json(error("NOT_FOUND", "Event not found"), 404);
  await db.delete(schema.scheduledEvents).where(eq(schema.scheduledEvents.id, event.id));
  return c.json(success({ deleted: true }), 200);
});

// ---------------------------------------------------------------------------
// Availability Slots
// ---------------------------------------------------------------------------

// GET /api/calendar/availability
calendarRoutes.get("/availability", requirePremium("Calendar Integration"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const slots = await db
    .select()
    .from(schema.availabilitySlots)
    .where(eq(schema.availabilitySlots.userId, userId));

  return c.json(success(slots), 200);
});

// POST /api/calendar/availability
calendarRoutes.post("/availability", requirePremium("Calendar Integration"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateSlotSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const db = getDb();
  const [slot] = await db
    .insert(schema.availabilitySlots)
    .values({ userId, ...parsed.data })
    .returning();

  return c.json(success(slot), 201);
});

// DELETE /api/calendar/availability/:id
calendarRoutes.delete("/availability/:id", requirePremium("Calendar Integration"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [slot] = await db
    .select({ id: schema.availabilitySlots.id })
    .from(schema.availabilitySlots)
    .where(and(eq(schema.availabilitySlots.id, c.req.param("id")), eq(schema.availabilitySlots.userId, userId)))
    .limit(1);

  if (!slot) return c.json(error("NOT_FOUND", "Availability slot not found"), 404);
  await db.delete(schema.availabilitySlots).where(eq(schema.availabilitySlots.id, slot.id));
  return c.json(success({ deleted: true }), 200);
});

// ---------------------------------------------------------------------------
// Calendar Connections (OAuth — stores access tokens)
// ---------------------------------------------------------------------------

// GET /api/calendar/connections
calendarRoutes.get("/connections", requirePremium("Calendar Integration"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const connections = await db
    .select({
      id: schema.calendarConnections.id,
      provider: schema.calendarConnections.provider,
      calendarName: schema.calendarConnections.calendarName,
      isActive: schema.calendarConnections.isActive,
      syncEnabled: schema.calendarConnections.syncEnabled,
      lastSyncedAt: schema.calendarConnections.lastSyncedAt,
      createdAt: schema.calendarConnections.createdAt,
    })
    .from(schema.calendarConnections)
    .where(eq(schema.calendarConnections.userId, userId));

  return c.json(success(connections), 200);
});

// DELETE /api/calendar/connections/:id — disconnect a calendar
calendarRoutes.delete("/connections/:id", requirePremium("Calendar Integration"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [conn] = await db
    .select({ id: schema.calendarConnections.id })
    .from(schema.calendarConnections)
    .where(and(eq(schema.calendarConnections.id, c.req.param("id")), eq(schema.calendarConnections.userId, userId)))
    .limit(1);

  if (!conn) return c.json(error("NOT_FOUND", "Calendar connection not found"), 404);
  await db.update(schema.calendarConnections).set({ isActive: false, updatedAt: new Date() }).where(eq(schema.calendarConnections.id, conn.id));
  return c.json(success({ disconnected: true }), 200);
});

calendarRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Calendar route not found" } }, 404),
);
