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
  ThemeCalendarError,
  adminCalendar,
  createEvent,
  deleteEvent,
  publicEvents,
  removeEventDate,
  setEventActive,
  setEventDate,
  updateEvent,
} from "../services/theme-calendar/themeCalendarUseCases.js";

const STATUS: Record<ThemeCalendarError["code"], 400 | 404 | 409> = {
  NOT_FOUND: 404,
  SLUG_TAKEN: 409,
  NOT_A_TABLE_EVENT: 400,
  BUILTIN_DELETE: 409,
};

function fail(c: Context, err: unknown): Response {
  if (err instanceof ThemeCalendarError) return c.json(error(err.code, err.message), STATUS[err.code]);
  throw err;
}

function invalid(c: Context, issues: z.ZodError): Response {
  return c.json(error("VALIDATION_ERROR", issues.issues[0]?.message ?? "Invalid event"), 400);
}

const isId = (id: string) => UuidLikeSchema.safeParse(id).success;

export const themeCalendarRoutes = new Hono<AppEnv>();

themeCalendarRoutes.get("/events", async (c) => c.json(success({ events: await publicEvents() })));

export const adminThemeCalendarRoutes = new Hono<AppEnv>();

adminThemeCalendarRoutes.use("*", superAdminMiddleware);

adminThemeCalendarRoutes.get("/", async (c) => c.json(success(await adminCalendar())));

adminThemeCalendarRoutes.post("/", async (c) => {
  const parsed = ThemeEventInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return invalid(c, parsed.error);
  try {
    return c.json(success(await createEvent(parsed.data, c.var.user.sub)), 201);
  } catch (err) {
    return fail(c, err);
  }
});

adminThemeCalendarRoutes.put("/:id", async (c) => {
  if (!isId(c.req.param("id"))) return c.json(error("NOT_FOUND", "Event not found"), 404);
  const parsed = ThemeEventInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return invalid(c, parsed.error);
  try {
    return c.json(success(await updateEvent(c.req.param("id"), parsed.data, c.var.user.sub)));
  } catch (err) {
    return fail(c, err);
  }
});

const ActiveSchema = z.object({ isActive: z.boolean() }).strict();

adminThemeCalendarRoutes.patch("/:id/active", async (c) => {
  if (!isId(c.req.param("id"))) return c.json(error("NOT_FOUND", "Event not found"), 404);
  const parsed = ActiveSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return invalid(c, parsed.error);
  try {
    return c.json(success(await setEventActive(c.req.param("id"), parsed.data.isActive, c.var.user.sub)));
  } catch (err) {
    return fail(c, err);
  }
});

adminThemeCalendarRoutes.delete("/:id", async (c) => {
  if (!isId(c.req.param("id"))) return c.json(error("NOT_FOUND", "Event not found"), 404);
  try {
    await deleteEvent(c.req.param("id"), c.var.user.sub);
    return c.json(success({ id: c.req.param("id") }));
  } catch (err) {
    return fail(c, err);
  }
});

adminThemeCalendarRoutes.put("/:id/dates", async (c) => {
  if (!isId(c.req.param("id"))) return c.json(error("NOT_FOUND", "Event not found"), 404);
  const parsed = ThemeEventDateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return invalid(c, parsed.error);
  try {
    return c.json(success(await setEventDate(c.req.param("id"), parsed.data, c.var.user.sub)));
  } catch (err) {
    return fail(c, err);
  }
});

adminThemeCalendarRoutes.delete("/:id/dates/:year", async (c) => {
  const year = Number(c.req.param("year"));
  if (!isId(c.req.param("id")) || !Number.isInteger(year)) return c.json(error("NOT_FOUND", "Date not found"), 404);
  try {
    return c.json(success(await removeEventDate(c.req.param("id"), year, c.var.user.sub)));
  } catch (err) {
    return fail(c, err);
  }
});
