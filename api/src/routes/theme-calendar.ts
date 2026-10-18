/**
 * Theme calendar (migration 0502, gap #2350).
 *
 *   /api/theme-calendar (public, no auth)
 *     GET  /events                 — active events (cached until an edit)
 *
 *   /api/admin/theme-calendar (SuperAdmin)
 *     GET    /                     — every event + missing yearly dates
 *     POST   /                     — create a custom event
 *     PUT    /:id                  — edit an event
 *     PATCH  /:id/active           — turn an event on / off
 *     DELETE /:id                  — delete a custom event
 *     PUT    /:id/dates            — set one yearly-table date
 *     DELETE /:id/dates/:year      — remove one
 *
 * Thin layer: validate → use case → map ThemeCalendarError to HTTP.
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import { ThemeEventDateSchema, ThemeEventInputSchema } from "../../../shared/theme-calendar/event.js";
import {
  adminCalendar,
  createEvent,
  deleteEvent,
  publicEvents,
  removeEventDate,
  setEventActive,
  setEventDate,
  updateEvent,
} from "../services/theme-calendar/themeCalendarUseCases.js";
import { validateJson } from "./helpers/validate.js";

function invalid(c: Context, issues: z.ZodError): Response {
  return c.json(error("VALIDATION_ERROR", issues.issues[0]?.message ?? "Invalid event"), 400);
}

const isId = (id: string) => UuidLikeSchema.safeParse(id).success;

export const themeCalendarRoutes = new Hono<AppEnv>();

themeCalendarRoutes.get("/events", async (c) => c.json(success({ events: await publicEvents() })));

export const adminThemeCalendarRoutes = new Hono<AppEnv>();

adminThemeCalendarRoutes.use("*", superAdminMiddleware);

adminThemeCalendarRoutes.get("/", async (c) => c.json(success(await adminCalendar())));

adminThemeCalendarRoutes.post("/", validateJson(ThemeEventInputSchema, (e, c) => invalid(c, e), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  return c.json(success(await createEvent(body, c.var.userId)), 201);
});

adminThemeCalendarRoutes.put("/:id", validateJson(ThemeEventInputSchema, (e, c) => invalid(c, e), { emptyBody: null }), async (c) => {
  if (!isId(c.req.param("id"))) return c.json(error("NOT_FOUND", "Event not found"), 404);
  const body = c.req.valid("json");
  return c.json(success(await updateEvent(c.req.param("id"), body, c.var.userId)));
});

const ActiveSchema = z.object({ isActive: z.boolean() }).strict();

adminThemeCalendarRoutes.patch("/:id/active", validateJson(ActiveSchema, (e, c) => invalid(c, e), { emptyBody: null }), async (c) => {
  if (!isId(c.req.param("id"))) return c.json(error("NOT_FOUND", "Event not found"), 404);
  const body = c.req.valid("json");
  return c.json(success(await setEventActive(c.req.param("id"), body.isActive, c.var.userId)));
});

adminThemeCalendarRoutes.delete("/:id", async (c) => {
  if (!isId(c.req.param("id"))) return c.json(error("NOT_FOUND", "Event not found"), 404);
  await deleteEvent(c.req.param("id"), c.var.userId);
  return c.json(success({ id: c.req.param("id") }));
});

adminThemeCalendarRoutes.put("/:id/dates", validateJson(ThemeEventDateSchema, (e, c) => invalid(c, e), { emptyBody: null }), async (c) => {
  if (!isId(c.req.param("id"))) return c.json(error("NOT_FOUND", "Event not found"), 404);
  const body = c.req.valid("json");
  return c.json(success(await setEventDate(c.req.param("id"), body, c.var.userId)));
});

adminThemeCalendarRoutes.delete("/:id/dates/:year", async (c) => {
  const year = Number(c.req.param("year"));
  if (!isId(c.req.param("id")) || !Number.isInteger(year)) return c.json(error("NOT_FOUND", "Date not found"), 404);
  return c.json(success(await removeEventDate(c.req.param("id"), year, c.var.userId)));
});
