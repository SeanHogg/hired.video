import { Hono } from "hono";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requirePro } from "../middleware/tierEnforcement.js";
import {
  markEventsPushed,
  upsertPulledEvents,
  type PulledCalendarEvent,
} from "../repositories/calendarSyncRepository.js";
import { apiBaseUrl, frontendBaseUrl } from "../utils/public-urls.js";
import { getEnv } from "../utils/env.js";
import { openCredential, sealCredential } from "../services/crypto/credential-columns.js";
import { clampLimit } from "../utils/pagination.js";
import { buildRepos } from "../repositories/index.js";
import { emitNotification } from "../services/notifications/notificationService.js";

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
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const from = c.req.query("from") ? new Date(c.req.query("from")!) : new Date();
  const to = c.req.query("to") ? new Date(c.req.query("to")!) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  // Hard cap on rows returned: a user with thousands of synced events would
  // otherwise OOM the Worker isolate (128 MB). 500 covers any reasonable
  // 30-day window; callers needing more pass a tighter `from`/`to`. Gap #1337.
  const limit = clampLimit(c.req.query("limit"), 500, 1000);

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
    .orderBy(schema.scheduledEvents.startAt)
    .limit(limit);

  return c.json(success(events), 200);
});

// ---------------------------------------------------------------------------
// POST /api/calendar/events — create a new scheduled event
// ---------------------------------------------------------------------------
calendarRoutes.post("/events", requirePro("Calendar Integration"), async (c) => {
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
    } as any)
    .returning();

  return c.json(success(event), 201);
});

// ---------------------------------------------------------------------------
// GET /api/calendar/events/:id
// ---------------------------------------------------------------------------
calendarRoutes.get("/events/:id", requirePro("Calendar Integration"), async (c) => {
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
calendarRoutes.patch("/events/:id", requirePro("Calendar Integration"), async (c) => {
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
calendarRoutes.delete("/events/:id", requirePro("Calendar Integration"), async (c) => {
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
calendarRoutes.get("/availability", requirePro("Calendar Integration"), async (c) => {
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
calendarRoutes.post("/availability", requirePro("Calendar Integration"), async (c) => {
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
calendarRoutes.delete("/availability/:id", requirePro("Calendar Integration"), async (c) => {
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
calendarRoutes.get("/connections", requirePro("Calendar Integration"), async (c) => {
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
calendarRoutes.delete("/connections/:id", requirePro("Calendar Integration"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const [conn] = await db
    .select({ id: schema.calendarConnections.id })
    .from(schema.calendarConnections)
    .where(and(eq(schema.calendarConnections.id, c.req.param("id")), eq(schema.calendarConnections.userId, userId)))
    .limit(1);

  if (!conn) return c.json(error("NOT_FOUND", "Calendar connection not found"), 404);
  await db.update(schema.calendarConnections).set({ isActive: false, updatedAt: new Date() } as any).where(eq(schema.calendarConnections.id, conn.id));
  return c.json(success({ disconnected: true }), 200);
});

// ---------------------------------------------------------------------------
// Google / Outlook OAuth — connect a calendar provider (#11)
// Two-step: /connect/begin → provider OAuth → /connect/callback stores tokens.
// ---------------------------------------------------------------------------

const CALENDAR_PROVIDERS: Record<string, { authUrl: string; tokenUrl: string; scopes: string[] }> = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly"],
  },
  outlook: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["https://graph.microsoft.com/Calendars.ReadWrite", "offline_access"],
  },
};

/**
 * GET /api/calendar/connect/:provider — redirect to provider OAuth consent screen.
 * ?redirect= sets the frontend URL to return to after connecting.
 */
calendarRoutes.get("/connect/:provider", requirePro("Calendar Integration"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const provider = c.req.param("provider").toLowerCase();
  const cfg = CALENDAR_PROVIDERS[provider];
  if (!cfg) return c.json(error("BAD_REQUEST", `Unknown provider: ${provider}`), 400);

  const clientId = getEnv(provider === "google" ? "GOOGLE_CLIENT_ID" : "MICROSOFT_CLIENT_ID");
  if (!clientId) return c.json(error("SERVICE_UNAVAILABLE", `${provider} calendar not configured`), 503);

  const redirect = c.req.query("redirect") ?? "/settings/integrations";
  // Embed userId + provider in state for the callback
  const state = btoa(JSON.stringify({ userId, provider, redirect, ts: Date.now() }));
  const callbackUrl = `${apiBaseUrl()}/api/calendar/connect/${provider}/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: cfg.scopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  });

  return c.redirect(`${cfg.authUrl}?${params.toString()}`);
});

/**
 * GET /api/calendar/connect/:provider/callback — OAuth callback, stores tokens.
 * Public — no auth token in headers (the callback comes from the provider).
 */
calendarRoutes.get("/connect/:provider/callback", async (c) => {
  const provider = c.req.param("provider").toLowerCase();
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  const frontendBase = frontendBaseUrl();

  if (!code || !stateParam) return c.redirect(`${frontendBase}/settings/integrations?error=missing_params`);

  let stateData: { userId: string; provider: string; redirect: string; ts: number };
  try {
    stateData = JSON.parse(atob(stateParam));
    if (Date.now() - stateData.ts > 10 * 60 * 1000) throw new Error("expired");
  } catch {
    return c.redirect(`${frontendBase}/settings/integrations?error=invalid_state`);
  }

  const cfg = CALENDAR_PROVIDERS[provider];
  const clientId = getEnv(provider === "google" ? "GOOGLE_CLIENT_ID" : "MICROSOFT_CLIENT_ID");
  const clientSecret = getEnv(provider === "google" ? "GOOGLE_CLIENT_SECRET" : "MICROSOFT_CLIENT_SECRET");
  const callbackUrl = `${apiBaseUrl()}/api/calendar/connect/${provider}/callback`;

  let accessToken = "";
  let refreshToken = "";
  let expiresIn = 3600;

  try {
    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: callbackUrl, client_id: clientId, client_secret: clientSecret }).toString(),
    });
    if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
    const data: any = await res.json();
    accessToken = data.access_token;
    refreshToken = data.refresh_token ?? "";
    expiresIn = data.expires_in ?? 3600;
  } catch {
    return c.redirect(`${frontendBase}${stateData.redirect}?error=calendar_auth_failed`);
  }

  const db = getDb();
  // Upsert calendar connection
  const [existing] = await db
    .select({ id: schema.calendarConnections.id })
    .from(schema.calendarConnections)
    .where(and(eq(schema.calendarConnections.userId, stateData.userId), eq(schema.calendarConnections.provider, provider)))
    .limit(1);

  const tokenExpiry = new Date(Date.now() + expiresIn * 1000);
  const access = await sealCredential(accessToken);
  const refresh = await sealCredential(refreshToken);
  if (existing) {
    await db.update(schema.calendarConnections).set({
      accessToken: access.plain,
      accessTokenEnc: access.enc,
      ...(refreshToken ? { refreshToken: refresh.plain, refreshTokenEnc: refresh.enc } : {}),
      tokenExpiresAt: tokenExpiry,
      isActive: true,
      syncEnabled: true,
      updatedAt: new Date(),
    } as any).where(eq(schema.calendarConnections.id, existing.id));
  } else {
    await db.insert(schema.calendarConnections).values({
      userId: stateData.userId,
      provider,
      calendarName: provider === "google" ? "Google Calendar" : "Outlook Calendar",
      accessToken: access.plain,
      accessTokenEnc: access.enc,
      refreshToken: refresh.plain,
      refreshTokenEnc: refresh.enc,
      tokenExpiresAt: tokenExpiry,
      isActive: true,
      syncEnabled: true,
    } as any);
  }

  return c.redirect(`${frontendBase}${stateData.redirect}?connected=${encodeURIComponent(provider)}`);
});

/**
 * POST /api/calendar/sync — trigger a two-way sync for the user's connected calendar.
 * Pushes hired.video calendar events to Google/Outlook and pulls back any
 * external events that overlap with scheduled interviews.
 */
calendarRoutes.post("/sync", requirePro("Calendar Integration"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const connections = await db
    .select()
    .from(schema.calendarConnections)
    .where(and(eq(schema.calendarConnections.userId, userId), eq(schema.calendarConnections.isActive, true)));

  if (!connections.length) return c.json(error("NOT_FOUND", "No connected calendars"), 404);

  const results: Array<{ provider: string; pushed: number; pulled: number; error?: string }> = [];

  for (const conn of connections) {
    try {
      const r = await syncCalendar(userId, conn as any);
      await db.update(schema.calendarConnections).set({ lastSyncedAt: new Date(), updatedAt: new Date() } as any)
        .where(eq(schema.calendarConnections.id, conn.id));
      results.push(r);
    } catch (err) {
      results.push({ provider: conn.provider, pushed: 0, pulled: 0, error: String(err) });
    }
  }

  return c.json(success({ synced: results.length, results }), 200);
});

type SyncableConnection = {
  id: string;
  provider: string;
  accessToken: string | null;
  accessTokenEnc: string | null;
  refreshToken: string | null;
  refreshTokenEnc: string | null;
  tokenExpiresAt: Date | null;
};

/**
 * Returns a valid access token for the connection, refreshing it first when it
 * is expired or within the skew window. Implements refresh-token rotation:
 * providers that hand back a new refresh token (Microsoft always; Google on
 * re-consent) have it persisted so the next refresh uses the current one.
 * Falls back to the stored access token when refresh isn't possible.
 */
async function ensureFreshAccessToken(conn: SyncableConnection): Promise<string | null> {
  const SKEW_MS = 2 * 60 * 1000;
  const currentAccess = await openCredential(conn.accessTokenEnc, conn.accessToken);
  const currentRefresh = await openCredential(conn.refreshTokenEnc, conn.refreshToken);
  const stillValid =
    !!conn.tokenExpiresAt && new Date(conn.tokenExpiresAt).getTime() - Date.now() > SKEW_MS;
  if (stillValid && currentAccess) return currentAccess;
  if (!currentRefresh) return currentAccess;

  const cfg = CALENDAR_PROVIDERS[conn.provider];
  if (!cfg) return currentAccess;
  const clientId = getEnv(conn.provider === "google" ? "GOOGLE_CLIENT_ID" : "MICROSOFT_CLIENT_ID");
  const clientSecret = getEnv(conn.provider === "google" ? "GOOGLE_CLIENT_SECRET" : "MICROSOFT_CLIENT_SECRET");
  if (!clientId || !clientSecret) return currentAccess;

  try {
    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: currentRefresh,
        client_id: clientId,
        client_secret: clientSecret,
        // Microsoft requires the scope on refresh; Google ignores it.
        ...(conn.provider === "outlook" ? { scope: cfg.scopes.join(" ") } : {}),
      }).toString(),
    });
    if (!res.ok) return currentAccess;
    const data: any = await res.json();
    const newAccess: string | undefined = data.access_token;
    if (!newAccess) return currentAccess;
    const expiresIn = Number(data.expires_in ?? 3600);
    const rotatedRefresh: string | undefined = data.refresh_token || undefined;
    const sealedAccess = await sealCredential(newAccess);
    const sealedRefresh = rotatedRefresh ? await sealCredential(rotatedRefresh) : null;
    await getDb()
      .update(schema.calendarConnections)
      .set({
        accessToken: sealedAccess.plain,
        accessTokenEnc: sealedAccess.enc,
        ...(sealedRefresh ? { refreshToken: sealedRefresh.plain, refreshTokenEnc: sealedRefresh.enc } : {}),
        tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
        updatedAt: new Date(),
      } as any)
      .where(eq(schema.calendarConnections.id, conn.id));
    return newAccess;
  } catch {
    return currentAccess;
  }
}

/**
 * Pushes one platform event to the provider's calendar and returns the created
 * external event id (or null on failure / unsupported provider). Google uses
 * Calendar v3; Outlook uses Microsoft Graph. Both providers share the same
 * caller loop in `syncCalendar` — only the request shape differs here.
 */
async function pushEventToProvider(
  provider: string,
  accessToken: string,
  ev: {
    title: string;
    description?: string | null;
    startAt: Date | string;
    endAt: Date | string;
    timezone?: string | null;
    location?: string | null;
    meetingUrl?: string | null;
  },
): Promise<string | null> {
  const startIso = new Date(ev.startAt as any).toISOString();
  const endIso = new Date(ev.endAt as any).toISOString();
  const timeZone = ev.timezone || "UTC";

  try {
    if (provider === "google") {
      const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: ev.title,
          description: ev.description ?? "",
          ...(ev.location ? { location: ev.location } : {}),
          start: { dateTime: startIso, timeZone },
          end: { dateTime: endIso, timeZone },
        }),
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      return data.id ?? null;
    }

    if (provider === "outlook") {
      // Graph wants a local (offset-free) datetime + an explicit timeZone.
      const graphTime = (iso: string) => iso.replace(/\.\d+Z$/, "").replace(/Z$/, "");
      const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: ev.title,
          body: { contentType: "HTML", content: ev.description ?? "" },
          start: { dateTime: graphTime(startIso), timeZone },
          end: { dateTime: graphTime(endIso), timeZone },
          ...(ev.location ? { location: { displayName: ev.location } } : {}),
          ...(ev.meetingUrl ? { onlineMeetingUrl: ev.meetingUrl } : {}),
        }),
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      return data.id ?? null;
    }
  } catch {
    return null;
  }
  return null; // ical / unknown — nothing to push to
}

/** One external event normalized to our `scheduled_events` shape. */
type PulledEvent = PulledCalendarEvent;

/**
 * Pulls upcoming events from the provider's calendar (now → +`days` days) and
 * returns them normalized. Google uses Calendar v3 `events.list` (singleEvents
 * so recurring instances expand); Outlook uses Graph `calendarView`. Cancelled
 * events and all-day-only entries without a usable time window are dropped.
 * Returns [] on any failure / unsupported provider — the caller treats pull as
 * best-effort so a provider hiccup never fails the whole sync.
 */
async function pullEventsFromProvider(
  provider: string,
  accessToken: string,
  days = 60,
): Promise<PulledEvent[]> {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  const MAX = 100;

  try {
    if (provider === "google") {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: String(MAX),
      });
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return [];
      const data: any = await res.json();
      const out: PulledEvent[] = [];
      for (const it of (data.items ?? []) as any[]) {
        if (!it?.id || it.status === "cancelled") continue;
        const startRaw = it.start?.dateTime ?? (it.start?.date ? `${it.start.date}T00:00:00Z` : null);
        const endRaw = it.end?.dateTime ?? (it.end?.date ? `${it.end.date}T00:00:00Z` : null);
        if (!startRaw || !endRaw) continue;
        out.push({
          externalEventId: String(it.id),
          title: String(it.summary ?? "(untitled event)").slice(0, 500),
          description: it.description ?? null,
          startAt: new Date(startRaw),
          endAt: new Date(endRaw),
          timezone: it.start?.timeZone ?? "UTC",
          location: it.location ?? null,
          meetingUrl: it.hangoutLink ?? null,
        });
      }
      return out;
    }

    if (provider === "outlook") {
      const params = new URLSearchParams({
        startDateTime: timeMin,
        endDateTime: timeMax,
        $top: String(MAX),
        $orderby: "start/dateTime",
      });
      const res = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
      });
      if (!res.ok) return [];
      const data: any = await res.json();
      const out: PulledEvent[] = [];
      for (const it of (data.value ?? []) as any[]) {
        if (!it?.id || it.isCancelled) continue;
        // Graph returns offset-free local datetimes paired with an explicit
        // timeZone; with the Prefer header above that is UTC, so append Z.
        const toDate = (t: any): Date | null => {
          if (!t?.dateTime) return null;
          const s = String(t.dateTime);
          return new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`);
        };
        const startAt = toDate(it.start);
        const endAt = toDate(it.end);
        if (!startAt || !endAt) continue;
        out.push({
          externalEventId: String(it.id),
          title: String(it.subject ?? "(untitled event)").slice(0, 500),
          description: it.bodyPreview ?? null,
          startAt,
          endAt,
          timezone: it.start?.timeZone ?? "UTC",
          location: it.location?.displayName ?? null,
          meetingUrl: it.onlineMeeting?.joinUrl ?? null,
        });
      }
      return out;
    }
  } catch {
    return [];
  }
  return []; // ical / unknown — nothing to pull
}

async function syncCalendar(
  userId: string,
  conn: SyncableConnection,
): Promise<{ provider: string; pushed: number; pulled: number }> {
  const db = getDb();

  // Refresh the token up front so a full sync run never half-fails on expiry.
  const accessToken = await ensureFreshAccessToken(conn);
  if (!accessToken || conn.provider === "ical") {
    return { provider: conn.provider, pushed: 0, pulled: 0 };
  }

  const events = await db
    .select()
    .from(schema.scheduledEvents)
    .where(and(
      eq(schema.scheduledEvents.userId, userId),
      eq(schema.scheduledEvents.syncedToCalendar, false),
    ))
    .limit(50)
    .catch(() => []);

  // Provider pushes are inherently per-event (external API); the DB stamp for
  // every successfully pushed row is ONE statement afterwards.
  const pushedRows: Array<{ id: string; externalEventId: string }> = [];
  for (const ev of events) {
    const externalId = await pushEventToProvider(conn.provider, accessToken, ev as any);
    if (externalId) pushedRows.push({ id: ev.id, externalEventId: externalId });
  }
  await markEventsPushed(db, conn.id, pushedRows);
  const pushed = pushedRows.length;

  // ─── Pull: external events → scheduled_events (the second sync direction) ──
  // Dedup by externalEventId scoped to this connection in a single pre-read so
  // re-syncs update in place instead of duplicating. Pulled rows are stored
  // syncedToCalendar:true with externalEventId set, so the push query above
  // (which selects syncedToCalendar=false) never echoes them back upstream.
  const pulledEvents = await pullEventsFromProvider(conn.provider, accessToken);
  // Pre-read dedup + one bulk UPDATE + one multi-row INSERT (was one write per event).
  const pulled = await upsertPulledEvents(db, userId, conn.id, pulledEvents);

  return { provider: conn.provider, pushed, pulled };
}

// ---------------------------------------------------------------------------
// Interview scheduling automation (#28) — real-interview slot booking
// Requires a connected calendar to check availability and propose slots.
// ---------------------------------------------------------------------------

/**
 * POST /api/calendar/interview-slots
 * Body: { interviewSessionId, duration: 30|60, daysAhead: 7 }
 * Reads the recruiter's calendar availability and proposes open slots.
 */
calendarRoutes.post("/interview-slots", requirePro("Interview Scheduling"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => ({}));
  const duration = Number(body.duration ?? 30);
  const daysAhead = Math.min(14, Math.max(1, Number(body.daysAhead ?? 7)));

  const db = getDb();

  // Get existing availability windows
  const availability = await db
    .select()
    .from(schema.availabilitySlots)
    .where(eq(schema.availabilitySlots.userId, userId))
    .catch(() => []);

  // Build time slots from availability windows
  const slots: Array<{ start: string; end: string; dayOfWeek: string }> = [];
  const now = new Date();

  for (let d = 1; d <= daysAhead; d++) {
    const date = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();

    const dayWindows = availability.filter((a: any) => a.dayOfWeek === dayOfWeek || a.isRecurring);
    for (const window of dayWindows) {
      const [startH, startM] = String((window as any).startTime ?? "09:00").split(":").map(Number);
      const [endH, endM] = String((window as any).endTime ?? "17:00").split(":").map(Number);

      let cursor = new Date(date);
      cursor.setHours(startH, startM, 0, 0);
      const windowEnd = new Date(date);
      windowEnd.setHours(endH, endM, 0, 0);

      while (cursor.getTime() + duration * 60 * 1000 <= windowEnd.getTime()) {
        const slotEnd = new Date(cursor.getTime() + duration * 60 * 1000);
        slots.push({
          start: cursor.toISOString(),
          end: slotEnd.toISOString(),
          dayOfWeek,
        });
        cursor = new Date(cursor.getTime() + duration * 60 * 1000);
      }
    }
  }

  // If no availability configured, return default business hours slots
  if (!slots.length) {
    for (let d = 1; d <= daysAhead; d++) {
      const date = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
      const dayNum = date.getDay();
      if (dayNum === 0 || dayNum === 6) continue; // skip weekends
      for (const hour of [9, 10, 11, 14, 15, 16]) {
        const start = new Date(date);
        start.setHours(hour, 0, 0, 0);
        const end = new Date(start.getTime() + duration * 60 * 1000);
        slots.push({ start: start.toISOString(), end: end.toISOString(), dayOfWeek: date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase() });
      }
    }
  }

  return c.json(success({ slots: slots.slice(0, 20), duration, daysAhead }), 200);
});

/**
 * POST /api/calendar/book-interview
 * Confirms a slot and creates a calendar event + notifies both parties.
 * Body: { slot: { start, end }, candidateId, jobTitle, notes? }
 */
calendarRoutes.post("/book-interview", requirePro("Interview Scheduling"), async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => ({}));
  if (!body.slot?.start || !body.slot?.end) return c.json(error("VALIDATION_ERROR", "slot.start and slot.end are required"), 400);

  const db = getDb();
  const [event] = await db.insert(schema.scheduledEvents).values({
    userId,
    title: `Interview: ${body.jobTitle ?? "Candidate"}`,
    description: body.notes ?? null,
    startAt: new Date(body.slot.start),
    endAt: new Date(body.slot.end),
    type: "interview",
    attendees: body.candidateId ? [body.candidateId] : [],
    syncedToCalendar: false,
  } as any).returning();

  // Trigger calendar sync in background
  const connections = await db.select().from(schema.calendarConnections)
    .where(and(eq(schema.calendarConnections.userId, userId), eq(schema.calendarConnections.isActive, true)))
    .limit(1).catch(() => []);

  if (connections.length) {
    (c.executionCtx as any)?.waitUntil?.(
      syncCalendar(userId, connections[0] as any).catch(() => undefined)
    );
  }

  // Notify candidate
  if (body.candidateId) {
    await emitNotification(
      { repos: buildRepos(db) },
      {
        recipientIds: [body.candidateId],
        type: "interview_scheduled",
        actor: null,
        title: "Interview Scheduled",
        message: `An interview has been scheduled for ${new Date(body.slot.start).toLocaleString()}. Check your calendar.`,
        extraData: { eventId: event.id, jobTitle: body.jobTitle },
      },
    ).catch(() => undefined);
  }

  return c.json(success({ event, synced: connections.length > 0 }), 201);
});

calendarRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Calendar route not found" } }, 404),
);
