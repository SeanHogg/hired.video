/**
 * "Grab a coffee" API.
 *
 * Routes:
 *   GET    /incoming         — pending requests waiting for me
 *   GET    /outgoing         — requests I've sent
 *   POST   /                 — create request (gated on recipient's
 *                              `openToCoffee` profile section)
 *   PATCH  /:id              — accept / decline (recipient only)
 *   POST   /:id/cancel       — cancel a pending request (requester only)
 */
import { Hono } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { buildApiDeps } from "../services/apiDeps.js";
import { getDb } from "../db/index.js";
import { CoffeeRequestService } from "../services/coffee/CoffeeRequestService.js";
import {
  CreateCoffeeRequestSchema,
  RespondCoffeeRequestSchema,
} from "../../../shared/coffee.js";
import { resolveProfileSections } from "../../../shared/profile-sections.js";

export const coffeeRoutes = new Hono<AppEnv>();

function getEnv(c: any): Record<string, string | undefined> {
  return (c?.env ?? {}) as Record<string, string | undefined>;
}

function buildCoffeeService(env: Record<string, string | undefined>): CoffeeRequestService {
  const deps = buildApiDeps(env);
  return new CoffeeRequestService({ ...deps, db: getDb() });
}

// ─── GET /incoming ─────────────────────────────────────────────────────
coffeeRoutes.get("/incoming", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const status = c.req.query("status") ?? "pending";
  const deps = buildApiDeps(getEnv(c));
  const rows = await deps.repos.coffeeRequests.findIncomingForUser(userId, status);
  return c.json(success(rows), 200);
});

// ─── GET /outgoing ─────────────────────────────────────────────────────
coffeeRoutes.get("/outgoing", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const status = c.req.query("status");
  const deps = buildApiDeps(getEnv(c));
  const rows = await deps.repos.coffeeRequests.findOutgoingForUser(userId, status ?? undefined);
  return c.json(success(rows), 200);
});

// ─── POST / — create request ───────────────────────────────────────────
coffeeRoutes.post("/", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateCoffeeRequestSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  // Gate on the recipient's openToCoffee profile section. If the recipient
  // has the section disabled, the CTA shouldn't render in the first place,
  // but the API is the source of truth — re-check here.
  const deps = buildApiDeps(getEnv(c));
  const recipient = await deps.repos.users.findById(parsed.data.recipientUserId);
  if (!recipient) return c.json(error("NOT_FOUND", "Recipient not found"), 404);

  const sections = resolveProfileSections(
    ((recipient as any)?.profile?.profileSections ?? {}),
    (recipient as any)?.role ?? null,
  );
  if (!sections.openToCoffee) {
    return c.json(
      error(
        "FORBIDDEN",
        "This person isn't open to coffee invites right now. Try Connect or Message instead.",
      ),
      403,
    );
  }

  const service = buildCoffeeService(getEnv(c));
  const result = await service.create(userId, parsed.data);
  if ("error" in result) {
    if (result.error === "self") return c.json(error("BAD_REQUEST", "Cannot request coffee with yourself"), 400);
    if (result.error === "duplicate")
      return c.json(error("CONFLICT", "You already have a pending coffee request with this person"), 409);
  }
  return c.json(success(result), 201);
});

// ─── PATCH /:id — accept / decline ─────────────────────────────────────
coffeeRoutes.patch("/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = RespondCoffeeRequestSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const service = buildCoffeeService(getEnv(c));
  const result = await service.respond(c.req.param("id"), userId, parsed.data);
  if (!result) return c.json(error("NOT_FOUND", "Coffee request not found"), 404);
  if ("error" in result) {
    if (result.error === "not_found") return c.json(error("NOT_FOUND", "Coffee request not found"), 404);
    if (result.error === "forbidden") return c.json(error("FORBIDDEN", "Only the recipient can respond"), 403);
    if (result.error === "already_responded")
      return c.json(error("CONFLICT", "This coffee request has already been responded to"), 409);
  }
  return c.json(success(result), 200);
});

// ─── POST /:id/cancel ──────────────────────────────────────────────────
coffeeRoutes.post("/:id/cancel", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const service = buildCoffeeService(getEnv(c));
  const ok = await service.cancel(c.req.param("id"), userId);
  if (!ok) return c.json(error("FORBIDDEN", "Cannot cancel this request"), 403);
  return c.json(success({ cancelled: true }), 200);
});

coffeeRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Coffee route not found" } }, 404),
);
