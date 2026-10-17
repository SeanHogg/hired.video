/**
 * Public events API.
 *
 * Boundary vs /api/calendar:
 *   • /api/calendar — private calendar items (interviews, meetings, review).
 *                     Pro-gated. Owned by the calendar feature.
 *   • /api/events   — public/unlisted/private discoverable events + RSVP.
 *                     NOT Pro-gated — hosting is part of the free product.
 *
 * Routes:
 *   GET    /                — search public events (free-text + geo + time)
 *   GET    /categories      — list event categories (built-in + workspace)
 *   GET    /mine            — events the current user is hosting OR attending
 *   POST   /                — create event (defaults to draft)
 *   GET    /:id             — resolve a single event (gated on visibility)
 *   GET    /slug/:slug      — resolve by slug (public-shareable URL)
 *   PATCH  /:id             — update event (host/co-host only)
 *   POST   /:id/publish     — flip publishedAt
 *   POST   /:id/cancel      — soft-cancel
 *   POST   /:id/rsvp        — RSVP / change RSVP / decline
 *   GET    /:id/attendees   — attendee list (gated on event visibility +
 *                              attendee opt-in)
 *   POST   /:id/attendees/:attendeeId/approve  — host approves pending RSVP
 *   POST   /:id/attendees/:attendeeId/reject   — host rejects pending RSVP
 *   POST   /:id/attendees/:attendeeId/check-in — host check-in at the door
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { buildApiDeps } from "../services/apiDeps.js";
import { requestEnv } from "../utils/env.js";
import { parsePagination } from "../utils/pagination.js";
import type { UserRow } from "../repositories/usersRepository.js";
import { LocationService } from "../services/location/LocationService.js";
import { EventService } from "../services/event/EventService.js";
import { EventRsvpService } from "../services/event/EventRsvpService.js";
import { EventMatchmakingService } from "../services/event/EventMatchmakingService.js";
import { EventBlastService } from "../services/event/EventBlastService.js";
import { logger } from "../lib/logger.js";
import {
  CreateEventSchema,
  EventSearchFilterSchema,
  RsvpSchema,
  UpdateEventSchema,
} from "../../../shared/events.js";

export const eventRoutes = new Hono<AppEnv>();


// ─── GET / — discovery search ──────────────────────────────────────────
eventRoutes.get("/", async (c) => {
  // Bounds mirror EventSearchFilterSchema (limit 1..100, default 20).
  const { limit, offset } = parsePagination(c, { defaultLimit: 20, maxLimit: 100 });
  const query = {
    q: c.req.query("q"),
    category: c.req.query("category"),
    format: c.req.query("format"),
    fromDate: c.req.query("fromDate"),
    toDate: c.req.query("toDate"),
    countryId: c.req.query("countryId") ? Number(c.req.query("countryId")) : undefined,
    stateId: c.req.query("stateId"),
    cityId: c.req.query("cityId"),
    latitude: c.req.query("lat") ? Number(c.req.query("lat")) : undefined,
    longitude: c.req.query("lng") ? Number(c.req.query("lng")) : undefined,
    radiusKm: c.req.query("radiusKm") ? Number(c.req.query("radiusKm")) : undefined,
    hostUserId: c.req.query("hostUserId"),
    scope: (c.req.query("scope") as any) ?? "upcoming",
    limit,
    offset,
  };
  const parsed = EventSearchFilterSchema.safeParse(query);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid query", parsed.error.flatten()), 400);

  const deps = buildApiDeps(requestEnv(c));
  const events = new EventService(deps);
  const location = new LocationService(deps);

  // Translate geo filter into an id allowlist on entity_kind='event'.
  let idAllowlist: string[] | undefined;
  const geo = {
    countryId: parsed.data.countryId,
    stateId: parsed.data.stateId,
    cityId: parsed.data.cityId,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    radiusKm: parsed.data.radiusKm,
  };
  const hasGeoFilter = Object.values(geo).some((v) => v !== undefined);
  if (hasGeoFilter) {
    const allow = await location.applyLocationFilter("event", geo as any);
    if (allow) idAllowlist = Array.from(allow);
  }

  const rows = await deps.repos.events.search({
    scope: parsed.data.scope,
    fromDate: parsed.data.fromDate ? new Date(parsed.data.fromDate) : undefined,
    toDate: parsed.data.toDate ? new Date(parsed.data.toDate) : undefined,
    category: parsed.data.category,
    format: parsed.data.format,
    hostUserId: parsed.data.hostUserId,
    q: parsed.data.q,
    idAllowlist,
    visibility: "public",
    limit: parsed.data.limit,
    offset: parsed.data.offset,
  });

  const viewerId = c.var.user?.sub ?? null;
  const resolved = await events.resolveMany(rows, viewerId);
  return c.json(success(resolved), 200);
});

// ─── GET /categories ───────────────────────────────────────────────────
eventRoutes.get("/categories", async (c) => {
  const deps = buildApiDeps(requestEnv(c));
  const cats = await deps.repos.events.listCategories(null);
  return c.json(success(cats), 200);
});

// ─── GET /mine — events I host or attend ───────────────────────────────
eventRoutes.get("/mine", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const scope = (c.req.query("scope") as "upcoming" | "past" | "all") ?? "upcoming";

  const deps = buildApiDeps(requestEnv(c));
  const events = new EventService(deps);

  const [hosted, attending] = await Promise.all([
    deps.repos.events.listForHost(userId, scope),
    deps.repos.events.findAttendingEventsForUser(userId, scope),
  ]);

  const attendingIds = Array.from(new Set(attending.map((a) => a.eventId)));
  // One inArray read; re-ordered to match the attendee ordering below.
  const attendingById = new Map(
    (await deps.repos.events.findByIds(attendingIds)).map((r) => [r.id, r]),
  );
  const attendingEvents = attendingIds
    .map((id) => attendingById.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  // Merge + dedupe by id (host wins).
  const seen = new Set<string>();
  const merged: typeof hosted = [];
  for (const r of [...hosted, ...attendingEvents]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    merged.push(r);
  }

  const resolved = await events.resolveMany(merged, userId);
  return c.json(success(resolved), 200);
});

// ─── POST / — create event ─────────────────────────────────────────────
eventRoutes.post("/", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateEventSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const deps = buildApiDeps(requestEnv(c));
  const events = new EventService(deps);
  const row = await events.create(userId, parsed.data);

  // Wire geo tags through LocationService if provided.
  if (parsed.data.geo) {
    const location = new LocationService(deps);
    await location.setForEntity("event", row.id, parsed.data.geo);
  }

  // Award gamification points to the host for creating an event.
  // Fire-and-forget — must never fail the create request.
  const { withGamification } = await import("../domains/gamification/with-gamification.js");
  await withGamification(c, "event-created", (game, role, uid) =>
    game.onEventCreated({ userId: uid, role, eventId: row.id }),
  );

  const resolved = await events.resolve(row, userId);
  return c.json(success(resolved), 201);
});

// ─── GET /slug/:slug ───────────────────────────────────────────────────
eventRoutes.get("/slug/:slug", async (c) => {
  const deps = buildApiDeps(requestEnv(c));
  const row = await deps.repos.events.findBySlug(c.req.param("slug"));
  if (!row) return c.json(error("NOT_FOUND", "Event not found"), 404);
  if (!isVisibleToViewer(row, c.var.user?.sub ?? null)) {
    return c.json(error("NOT_FOUND", "Event not found"), 404);
  }
  const resolved = await new EventService(deps).resolve(row, c.var.user?.sub ?? null);
  return c.json(success(resolved), 200);
});

// ─── GET /:id ──────────────────────────────────────────────────────────
eventRoutes.get("/:id", async (c) => {
  const deps = buildApiDeps(requestEnv(c));
  const row = await deps.repos.events.findById(c.req.param("id"));
  if (!row) return c.json(error("NOT_FOUND", "Event not found"), 404);
  if (!isVisibleToViewer(row, c.var.user?.sub ?? null)) {
    return c.json(error("NOT_FOUND", "Event not found"), 404);
  }
  const resolved = await new EventService(deps).resolve(row, c.var.user?.sub ?? null);
  return c.json(success(resolved), 200);
});

// ─── PATCH /:id ────────────────────────────────────────────────────────
eventRoutes.patch("/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateEventSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const deps = buildApiDeps(requestEnv(c));
  const events = new EventService(deps);
  const updated = await events.update(c.req.param("id"), userId, parsed.data);
  if (!updated) return c.json(error("FORBIDDEN", "Cannot edit this event"), 403);

  if (parsed.data.geo) {
    await new LocationService(deps).setForEntity("event", updated.id, parsed.data.geo);
  }

  const resolved = await events.resolve(updated, userId);
  return c.json(success(resolved), 200);
});

// ─── POST /:id/publish ─────────────────────────────────────────────────
eventRoutes.post("/:id/publish", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const deps = buildApiDeps(requestEnv(c));
  const events = new EventService(deps);
  const updated = await events.update(c.req.param("id"), userId, { publish: true });
  if (!updated) return c.json(error("FORBIDDEN", "Cannot publish this event"), 403);
  const resolved = await events.resolve(updated, userId);
  return c.json(success(resolved), 200);
});

// ─── POST /:id/cancel ──────────────────────────────────────────────────
eventRoutes.post("/:id/cancel", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const deps = buildApiDeps(requestEnv(c));
  const events = new EventService(deps);
  const updated = await events.cancel(c.req.param("id"), userId);
  if (!updated) return c.json(error("FORBIDDEN", "Cannot cancel this event"), 403);
  const resolved = await events.resolve(updated, userId);
  return c.json(success(resolved), 200);
});

// ─── POST /:id/rsvp ────────────────────────────────────────────────────
eventRoutes.post("/:id/rsvp", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = RsvpSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const deps = buildApiDeps(requestEnv(c));
  const rsvp = new EventRsvpService(deps);
  const result = await rsvp.rsvp(c.req.param("id"), userId, parsed.data);
  if (!result) return c.json(error("NOT_FOUND", "Event not found or cancelled"), 404);

  // Award the registrant once their RSVP is confirmed 'going'. Waitlist /
  // pending / declined don't earn. Deduped on event id inside the helper.
  if (result.outcome === "going") {
    const { withGamification } = await import("../domains/gamification/with-gamification.js");
    await withGamification(c, "event-registered", (game, role, uid) =>
      game.onEventRegistered({ userId: uid, role, eventId: c.req.param("id") }),
    );
  }

  return c.json(success(result), 200);
});

// ─── GET /:id/attendees ────────────────────────────────────────────────
eventRoutes.get("/:id/attendees", async (c) => {
  const deps = buildApiDeps(requestEnv(c));
  const eventId = c.req.param("id");
  const row = await deps.repos.events.findById(eventId);
  if (!row) return c.json(error("NOT_FOUND", "Event not found"), 404);
  if (!isVisibleToViewer(row, c.var.user?.sub ?? null)) {
    return c.json(error("NOT_FOUND", "Event not found"), 404);
  }

  const attendees = await deps.repos.events.findAttendeesByEvent(eventId, "going");
  // Strip rows whose user opted out of attendee-list visibility.
  // For v1 we expose name + avatar of registered users only. Guest invitees
  // are not listed publicly; the host's tools see them via a separate
  // host-only endpoint (added in M6).
  const userIds = attendees.map((a) => a.userId).filter(Boolean) as string[];
  const usersById = await loadUsersById(deps, userIds);
  const users = userIds.map((id) => usersById.get(id) ?? null);
  const out = userIds.map((id, i) => ({
    userId: id,
    name:
      (users[i] as any)?.profile?.displayName ||
      [(users[i] as any)?.firstName, (users[i] as any)?.lastName].filter(Boolean).join(" ") ||
      "Attendee",
    avatarUrl: (users[i] as any)?.avatarUrl ?? null,
    rsvpStatus: attendees[i].rsvpStatus,
    checkedIn: Boolean(attendees[i].checkedInAt),
  }));
  return c.json(success({ count: out.length, attendees: out }), 200);
});

// ─── GET /:id/attendees/pending — host-only approval queue (#1257) ─────
// Returns the attendee rows awaiting approval (approvalStatus='pending')
// with the requester's identity + custom answers, so the host can approve
// or reject inline instead of round-tripping through the CSV export.
eventRoutes.get("/:id/attendees/pending", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const deps = buildApiDeps(requestEnv(c));
  const eventId = c.req.param("id");
  const event = await deps.repos.events.findById(eventId);
  if (!event) return c.json(error("NOT_FOUND", "Event not found"), 404);

  const isHost = event.hostUserId === userId || event.userId === userId;
  const coHosts = await deps.repos.events.findCoHostsByEvent(event.id);
  const isCoHost = coHosts.some((ch) => ch.userId === userId);
  if (!isHost && !isCoHost) {
    return c.json(error("FORBIDDEN", "Host or co-host access required"), 403);
  }

  const all = await deps.repos.events.findAttendeesByEvent(eventId);
  const pending = all.filter((a) => a.approvalStatus === "pending");
  const pendingUsersById = await loadUsersById(
    deps,
    pending.map((a) => a.userId).filter((id): id is string => Boolean(id)),
  );
  const users = pending.map((a) => (a.userId ? pendingUsersById.get(a.userId) ?? null : null));
  const out = pending.map((a, i) => {
    const u = users[i] as any;
    return {
      attendeeId: a.id,
      userId: a.userId,
      name:
        u?.profile?.displayName ||
        [u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
        a.guestName ||
        a.guestEmail ||
        "Guest",
      avatarUrl: u?.avatarUrl ?? null,
      guestEmail: a.guestEmail ?? null,
      plusOneCount: a.plusOneCount,
      customAnswers: a.customAnswers ?? null,
      rsvpedAt: a.rsvpedAt.toISOString(),
    };
  });
  return c.json(success({ count: out.length, attendees: out }), 200);
});

// ─── POST /:id/attendees/:attendeeId/approve|reject|check-in ───────────
const attendeeActionSchema = z.object({});

eventRoutes.post("/:id/attendees/:attendeeId/approve", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  void attendeeActionSchema.safeParse(await c.req.json().catch(() => ({})));
  const deps = buildApiDeps(requestEnv(c));
  const rsvp = new EventRsvpService(deps);
  const ok = await rsvp.approve(c.req.param("id"), c.req.param("attendeeId"), userId);
  if (!ok) return c.json(error("FORBIDDEN", "Cannot approve this RSVP"), 403);
  return c.json(success({ approved: true }), 200);
});

eventRoutes.post("/:id/attendees/:attendeeId/reject", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const deps = buildApiDeps(requestEnv(c));
  const rsvp = new EventRsvpService(deps);
  const ok = await rsvp.reject(c.req.param("id"), c.req.param("attendeeId"), userId);
  if (!ok) return c.json(error("FORBIDDEN", "Cannot reject this RSVP"), 403);
  return c.json(success({ rejected: true }), 200);
});

eventRoutes.post("/:id/attendees/:attendeeId/check-in", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const deps = buildApiDeps(requestEnv(c));
  const rsvp = new EventRsvpService(deps);
  const result = await rsvp.checkIn(c.req.param("id"), c.req.param("attendeeId"), userId);
  if (result === false) return c.json(error("FORBIDDEN", "Cannot check in this attendee"), 403);

  // A fresh check-in of a registered attendee credits THAT attendee (not the
  // host doing the check-in) with attendance points. Role is resolved from
  // the DB because the earner isn't the JWT actor. Fire-and-forget.
  if (typeof result === "string") {
    try {
      const { GamificationService, ACTIONS } = await import("../domains/gamification/index.js");
      const game = new GamificationService(deps.repos);
      await game.awardWithRoleLookup(ACTIONS.EVENT_ATTENDED, {
        userId: result,
        refId: c.req.param("id"),
        refType: "event",
      });
    } catch (e) {
      logger.warn("[gamification] event-attended award failed", { error: String(e) });
    }
  }

  return c.json(success({ checkedIn: true }), 200);
});

// ─── GET /:id/matches — AI introductions for the viewer ───────────────
// Read-through: returns cached scores first; refreshes from heuristic if
// the cache is empty for (event, viewer). Backed by EventMatchmakingService
// (gap #1244 — LLM upgrade is the v2).
eventRoutes.get("/:id/matches", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const deps = buildApiDeps(requestEnv(c));
  const matchmaking = new EventMatchmakingService(deps);

  let matches = await matchmaking.topForViewer(c.req.param("id"), userId, 10);
  if (matches.length === 0) {
    const refreshed = await matchmaking.refreshForViewer(c.req.param("id"), userId, 10);
    matches = refreshed.map((m) => ({ ...m, reason: m.reason as string | null }));
  }

  // Hydrate names + avatars in one shot.
  const userIds = matches.map((m) => m.matchUserId);
  const matchUsersById = await loadUsersById(deps, userIds);
  const users = userIds.map((id) => matchUsersById.get(id) ?? null);
  const out = matches.map((m, i) => {
    const u: any = users[i];
    return {
      userId: m.matchUserId,
      score: m.score,
      reason: m.reason,
      name:
        u?.profile?.displayName ||
        [u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
        u?.email ||
        "Attendee",
      avatarUrl: u?.avatarUrl ?? null,
      headline: u?.profile?.headline ?? null,
    };
  });

  return c.json(success({ matches: out }), 200);
});

// ─── GET /:id/analytics — host-only RSVP funnel + counters ────────────
eventRoutes.get("/:id/analytics", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const deps = buildApiDeps(requestEnv(c));
  const event = await deps.repos.events.findById(c.req.param("id"));
  if (!event) return c.json(error("NOT_FOUND", "Event not found"), 404);

  const isHost = event.hostUserId === userId || event.userId === userId;
  const coHosts = await deps.repos.events.findCoHostsByEvent(event.id);
  const isCoHost = coHosts.some((c) => c.userId === userId);
  if (!isHost && !isCoHost) {
    return c.json(error("FORBIDDEN", "Host or co-host access required"), 403);
  }

  const [going, maybe, declined, waitlist, pending] = await Promise.all([
    deps.repos.events.countAttendees(event.id, "going"),
    deps.repos.events.countAttendees(event.id, "maybe"),
    deps.repos.events.countAttendees(event.id, "declined"),
    deps.repos.events.countAttendees(event.id, "waitlist"),
    deps.repos.events.countAttendees(event.id, "going").then(async () => {
      // Approved-pending split: count attendees whose approvalStatus = 'pending'.
      const all = await deps.repos.events.findAttendeesByEvent(event.id);
      return all.filter((a) => a.approvalStatus === "pending").length;
    }),
  ]);

  const all = await deps.repos.events.findAttendeesByEvent(event.id);
  const checkedIn = all.filter((a) => a.checkedInAt).length;

  return c.json(
    success({
      counts: { going, maybe, declined, waitlist, pendingApproval: pending, checkedIn },
      capacity: event.capacity,
      attendeeCount: event.attendeeCount,
      waitlistCount: event.waitlistCount,
      published: Boolean(event.publishedAt),
      cancelled: Boolean(event.cancelledAt),
    }),
    200,
  );
});

// ─── GET /:id/attendees/export.csv — host-only attendee CSV ───────────
eventRoutes.get("/:id/attendees/export.csv", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const deps = buildApiDeps(requestEnv(c));
  const event = await deps.repos.events.findById(c.req.param("id"));
  if (!event) return c.json(error("NOT_FOUND", "Event not found"), 404);

  const isHost = event.hostUserId === userId || event.userId === userId;
  const coHosts = await deps.repos.events.findCoHostsByEvent(event.id);
  const isCoHost = coHosts.some((c) => c.userId === userId);
  if (!isHost && !isCoHost) {
    return c.json(error("FORBIDDEN", "Host or co-host access required"), 403);
  }

  const attendees = await deps.repos.events.findAttendeesByEvent(event.id);
  const userIds = attendees.map((a) => a.userId).filter(Boolean) as string[];
  const byId: Map<string, any> = await loadUsersById(deps, userIds);

  const esc = (v: string | null | undefined) =>
    `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    "name,email,rsvp_status,approval_status,plus_ones,rsvped_at,checked_in_at,cancelled_at",
  ];
  for (const a of attendees) {
    const u = a.userId ? byId.get(a.userId) : null;
    const name =
      u?.profile?.displayName ??
      [u?.firstName, u?.lastName].filter(Boolean).join(" ") ??
      a.guestName ??
      "";
    const email = u?.email ?? a.guestEmail ?? "";
    lines.push(
      [
        esc(name),
        esc(email),
        esc(a.rsvpStatus),
        esc(a.approvalStatus),
        esc(String(a.plusOneCount)),
        esc(a.rsvpedAt?.toISOString() ?? null),
        esc(a.checkedInAt?.toISOString() ?? null),
        esc(a.cancelledAt?.toISOString() ?? null),
      ].join(","),
    );
  }

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="event-${event.slug ?? event.id}-attendees.csv"`,
    },
  });
});

// ─── POST /:id/blast — host announcement to all approved attendees ────
eventRoutes.post("/:id/blast", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => ({}));
  const subject = String(body?.subject ?? "").trim();
  const message = String(body?.message ?? "").trim();
  if (!subject || !message) {
    return c.json(error("VALIDATION_ERROR", "Subject and message are required"), 400);
  }

  const deps = buildApiDeps(requestEnv(c));
  const blast = new EventBlastService(deps);
  if (!(await blast.canBlast(c.req.param("id"), userId))) {
    return c.json(error("FORBIDDEN", "Only the host or co-hosts can blast attendees"), 403);
  }

  try {
    const res = await blast.send(c.req.param("id"), userId, subject, message);
    return c.json(success(res), 200);
  } catch {
    return c.json(error("NOT_FOUND", "Event not found"), 404);
  }
});

eventRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Event route not found" } }, 404),
);

/**
 * Visibility gate. Hosts + co-hosts + invited attendees can always view.
 * Public events are visible to anyone. Unlisted requires the URL (we
 * accept any view if visibility='unlisted' since the only way to reach
 * here is via the slug or a direct id share). Private is gated to host +
 * invited attendees.
 */
/** Batch user hydration — one inArray read keyed by id (was N findById). */
async function loadUsersById(
  deps: ReturnType<typeof buildApiDeps>,
  ids: string[],
): Promise<Map<string, UserRow>> {
  const unique = Array.from(new Set(ids));
  const rows = await deps.repos.users.findManyByIds(unique);
  return new Map(rows.map((u) => [u.id, u]));
}

function isVisibleToViewer(row: any, viewerId: string | null): boolean {
  if (row.visibility === "public" || row.visibility === "unlisted") return true;
  if (!viewerId) return false;
  // For private events, full access check would need an attendee query;
  // for the M1 cut, allow the host + creator only. Invited-attendee
  // visibility is added in M2 when the invite-by-link surface lands.
  return row.hostUserId === viewerId || row.userId === viewerId;
}
