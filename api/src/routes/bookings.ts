/**
 * /api/bookings/* — calendar-bookable 1:1 sessions (Creator program #7).
 *
 * Owner-only visibility is enforced at the service layer, not here —
 * the route just routes by auth + magic-link token. Public reads
 * (slot grid, host page) take no auth; host-only writes require
 * `c.var.user`. Booker actions (comment / reschedule / cancel via
 * magic-link) take the token as auth.
 *
 * Reference: docs/prd/bookings-and-reservations.md, gap #1648.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  BookingsService,
  BookingsServiceError,
  defaultBookingsServiceDeps,
} from "../services/bookings/index.js";
import {
  AddCommentInputSchema,
  AvailabilityOverrideInputSchema,
  AvailabilityRuleInputSchema,
  BookingOfferingInputSchema,
  CancelReservationInputSchema,
  CreateReservationInputSchema,
  RescheduleReservationInputSchema,
} from "../../../shared/bookings.js";

export const bookingsRoutes = new Hono<AppEnv>();

const buildService = () => new BookingsService(defaultBookingsServiceDeps());

function uid(c: Context): string | null {
  return ((c.var as any).user?.sub as string | undefined) ?? null;
}

function mapError(c: Context, e: unknown) {
  if (e instanceof BookingsServiceError) {
    const status =
      e.code === "NOT_FOUND" ? 404
      : e.code === "FORBIDDEN" ? 403
      : e.code === "CONFLICT" ? 409
      : e.code === "SLOT_UNAVAILABLE" ? 409
      : e.code === "INVALID_STATE" ? 409
      : e.code === "NOT_ENROLLED" ? 403
      : 400;
    return c.json(error(e.code, e.message), status as 400 | 403 | 404 | 409);
  }
  return c.json(error("INTERNAL_ERROR", "Unexpected error"), 500);
}

// ===========================================================================
// Public — no auth
// ===========================================================================

// GET /public/host/:handle — host page (display name, bio, offerings)
bookingsRoutes.get("/public/host/:handle", async (c) => {
  try {
    const host = await buildService().getPublicHostByHandle(c.req.param("handle"));
    return c.json(success(host));
  } catch (e) {
    return mapError(c, e);
  }
});

// GET /public/host/:handle/availability?offering=:slug&from=:iso&to=:iso
bookingsRoutes.get("/public/host/:handle/availability", async (c) => {
  const handle = c.req.param("handle");
  const offeringSlug = c.req.query("offering");
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (!offeringSlug || !from || !to) {
    return c.json(error("VALIDATION_ERROR", "offering, from, to are required"), 400);
  }
  try {
    const grid = await buildService().listPublicSlots({
      handle,
      offeringSlug,
      fromUtc: from,
      toUtc: to,
    });
    return c.json(success(grid));
  } catch (e) {
    return mapError(c, e);
  }
});

// POST /public/reservations — booker creates a reservation (no auth required).
bookingsRoutes.post("/public/reservations", async (c) => {
  let parsed;
  try {
    parsed = CreateReservationInputSchema.parse(await c.req.json());
  } catch {
    return c.json(error("VALIDATION_ERROR", "Invalid input"), 400);
  }
  try {
    const out = await buildService().createReservation(parsed);
    return c.json(success(out), 201);
  } catch (e) {
    return mapError(c, e);
  }
});

// GET /r/:token — fetch reservation by magic-link token.
bookingsRoutes.get("/r/:token", async (c) => {
  try {
    const res = await buildService().getReservationByMagicToken(c.req.param("token"));
    return c.json(success(res));
  } catch (e) {
    return mapError(c, e);
  }
});

// POST /r/:token/comments — booker adds comment via magic link.
bookingsRoutes.post("/r/:token/comments", async (c) => {
  let parsed;
  try {
    parsed = AddCommentInputSchema.parse(await c.req.json());
  } catch {
    return c.json(error("VALIDATION_ERROR", "Invalid input"), 400);
  }
  try {
    const out = await buildService().addComment({
      actor: "booker",
      magicLinkToken: c.req.param("token"),
      input: parsed,
    });
    return c.json(success(out), 201);
  } catch (e) {
    return mapError(c, e);
  }
});

// GET /r/:token/comments — list comments visible to booker (host + booker entries).
bookingsRoutes.get("/r/:token/comments", async (c) => {
  try {
    const out = await buildService().listComments({
      actor: "booker",
      magicLinkToken: c.req.param("token"),
    });
    return c.json(success(out));
  } catch (e) {
    return mapError(c, e);
  }
});

// POST /r/:token/reschedule — booker reschedules.
bookingsRoutes.post("/r/:token/reschedule", async (c) => {
  let parsed;
  try {
    parsed = RescheduleReservationInputSchema.parse(await c.req.json());
  } catch {
    return c.json(error("VALIDATION_ERROR", "Invalid input"), 400);
  }
  try {
    const out = await buildService().rescheduleReservation({
      actor: "booker",
      magicLinkToken: c.req.param("token"),
      input: parsed,
    });
    return c.json(success(out));
  } catch (e) {
    return mapError(c, e);
  }
});

// POST /r/:token/cancel — booker cancels.
bookingsRoutes.post("/r/:token/cancel", async (c) => {
  let parsed;
  try {
    parsed = CancelReservationInputSchema.parse(await c.req.json().catch(() => ({})));
  } catch {
    return c.json(error("VALIDATION_ERROR", "Invalid input"), 400);
  }
  try {
    const out = await buildService().cancelReservation({
      actor: "booker",
      magicLinkToken: c.req.param("token"),
      input: parsed,
    });
    return c.json(success(out));
  } catch (e) {
    return mapError(c, e);
  }
});

// ===========================================================================
// Host — auth required
// ===========================================================================

// GET /me/host — host identity + bookings-program enrollment + Stripe state.
bookingsRoutes.get("/me/host", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    const host = await buildService().requireOwnHost(userId);
    return c.json(success(host));
  } catch (e) {
    return mapError(c, e);
  }
});

// GET /me/offerings — own catalog (incl. inactive).
bookingsRoutes.get("/me/offerings", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    return c.json(success(await buildService().listOwnedOfferings(userId)));
  } catch (e) {
    return mapError(c, e);
  }
});

// POST /me/offerings — create.
bookingsRoutes.post("/me/offerings", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  let parsed;
  try {
    parsed = BookingOfferingInputSchema.parse(await c.req.json());
  } catch {
    return c.json(error("VALIDATION_ERROR", "Invalid input"), 400);
  }
  try {
    return c.json(success(await buildService().upsertOffering(userId, parsed)), 201);
  } catch (e) {
    return mapError(c, e);
  }
});

// PUT /me/offerings/:id — update.
bookingsRoutes.put("/me/offerings/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  let parsed;
  try {
    parsed = BookingOfferingInputSchema.parse(await c.req.json());
  } catch {
    return c.json(error("VALIDATION_ERROR", "Invalid input"), 400);
  }
  try {
    return c.json(
      success(await buildService().upsertOffering(userId, parsed, c.req.param("id"))),
    );
  } catch (e) {
    return mapError(c, e);
  }
});

// DELETE /me/offerings/:id — soft delete.
bookingsRoutes.delete("/me/offerings/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    await buildService().deleteOffering(userId, c.req.param("id"));
    return c.json(success({ deleted: true }));
  } catch (e) {
    return mapError(c, e);
  }
});

// GET /me/availability/rules — list recurring rules.
bookingsRoutes.get("/me/availability/rules", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    return c.json(success(await buildService().listAvailabilityRules(userId)));
  } catch (e) {
    return mapError(c, e);
  }
});

// POST /me/availability/rules — add rule.
bookingsRoutes.post("/me/availability/rules", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  let parsed;
  try {
    parsed = AvailabilityRuleInputSchema.parse(await c.req.json());
  } catch {
    return c.json(error("VALIDATION_ERROR", "Invalid input"), 400);
  }
  try {
    return c.json(success(await buildService().addAvailabilityRule(userId, parsed)), 201);
  } catch (e) {
    return mapError(c, e);
  }
});

// DELETE /me/availability/rules/:id
bookingsRoutes.delete("/me/availability/rules/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    await buildService().deleteAvailabilityRule(userId, c.req.param("id"));
    return c.json(success({ deleted: true }));
  } catch (e) {
    return mapError(c, e);
  }
});

// POST /me/availability/overrides — add one-off.
bookingsRoutes.post("/me/availability/overrides", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  let parsed;
  try {
    parsed = AvailabilityOverrideInputSchema.parse(await c.req.json());
  } catch {
    return c.json(error("VALIDATION_ERROR", "Invalid input"), 400);
  }
  try {
    return c.json(success(await buildService().addAvailabilityOverride(userId, parsed)), 201);
  } catch (e) {
    return mapError(c, e);
  }
});

// DELETE /me/availability/overrides/:id
bookingsRoutes.delete("/me/availability/overrides/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    await buildService().deleteAvailabilityOverride(userId, c.req.param("id"));
    return c.json(success({ deleted: true }));
  } catch (e) {
    return mapError(c, e);
  }
});

// GET /me/reservations — host dashboard.
bookingsRoutes.get("/me/reservations", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    return c.json(success(await buildService().listReservationsForHost(userId)));
  } catch (e) {
    return mapError(c, e);
  }
});

// GET /me/reservations/:id — single reservation, host-side wide shape.
bookingsRoutes.get("/me/reservations/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    return c.json(
      success(await buildService().getReservationForHost(userId, c.req.param("id"))),
    );
  } catch (e) {
    return mapError(c, e);
  }
});

// POST /me/reservations/:id/comments — host posts comment.
bookingsRoutes.post("/me/reservations/:id/comments", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  let parsed;
  try {
    parsed = AddCommentInputSchema.parse(await c.req.json());
  } catch {
    return c.json(error("VALIDATION_ERROR", "Invalid input"), 400);
  }
  try {
    const out = await buildService().addComment({
      actor: "host",
      actorUserId: userId,
      reservationId: c.req.param("id"),
      input: parsed,
    });
    return c.json(success(out), 201);
  } catch (e) {
    return mapError(c, e);
  }
});

// GET /me/reservations/:id/comments — host reads thread.
bookingsRoutes.get("/me/reservations/:id/comments", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  try {
    const out = await buildService().listComments({
      actor: "host",
      actorUserId: userId,
      reservationId: c.req.param("id"),
    });
    return c.json(success(out));
  } catch (e) {
    return mapError(c, e);
  }
});

// POST /me/reservations/:id/cancel — host cancels.
bookingsRoutes.post("/me/reservations/:id/cancel", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  let parsed;
  try {
    parsed = CancelReservationInputSchema.parse(await c.req.json().catch(() => ({})));
  } catch {
    return c.json(error("VALIDATION_ERROR", "Invalid input"), 400);
  }
  try {
    const out = await buildService().cancelReservation({
      actor: "host",
      actorUserId: userId,
      reservationId: c.req.param("id"),
      input: parsed,
    });
    return c.json(success(out));
  } catch (e) {
    return mapError(c, e);
  }
});

// POST /me/reservations/:id/reschedule — host reschedules.
bookingsRoutes.post("/me/reservations/:id/reschedule", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  let parsed;
  try {
    parsed = RescheduleReservationInputSchema.parse(await c.req.json());
  } catch {
    return c.json(error("VALIDATION_ERROR", "Invalid input"), 400);
  }
  try {
    const out = await buildService().rescheduleReservation({
      actor: "host",
      actorUserId: userId,
      reservationId: c.req.param("id"),
      input: parsed,
    });
    return c.json(success(out));
  } catch (e) {
    return mapError(c, e);
  }
});

// POST /me/reservations/:id/mark-paid — manual confirm (used in v1 until
// Stripe webhook lands; admin / dev tooling only). Logged in gap register
// follow-up #1648a (Stripe webhook integration).
bookingsRoutes.post("/me/reservations/:id/mark-paid", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({})) as { paymentIntentId?: string };
  const intentId = (body.paymentIntentId ?? "").trim() || "manual:host";
  try {
    // Confirm host owns the reservation before we mark it paid.
    const detail = await buildService().getReservationForHost(userId, c.req.param("id"));
    const out = await buildService().markPaid({
      reservationId: detail.id,
      paymentIntentId: intentId,
    });
    return c.json(success(out));
  } catch (e) {
    return mapError(c, e);
  }
});
