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
import { requestEnv } from "../utils/env.js";
import { CoffeeRequestService } from "../services/coffee/CoffeeRequestService.js";
import {
  CreateCoffeeRequestSchema,
  RespondCoffeeRequestSchema,
} from "../../../shared/coffee.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const coffeeRoutes = new Hono<AppEnv>();

function buildCoffeeService(env: Record<string, string | undefined>): CoffeeRequestService {
  return new CoffeeRequestService(buildApiDeps(env));
}

// ─── GET /incoming ─────────────────────────────────────────────────────
coffeeRoutes.get("/incoming", async (c) => {
  const userId = requireUser(c);
  const status = c.req.query("status") ?? "pending";
  const rows = await buildCoffeeService(requestEnv(c)).listIncoming(userId, status);
  return c.json(success(rows), 200);
});

// ─── GET /outgoing ─────────────────────────────────────────────────────
coffeeRoutes.get("/outgoing", async (c) => {
  const userId = requireUser(c);
  const status = c.req.query("status");
  const rows = await buildCoffeeService(requestEnv(c)).listOutgoing(userId, status ?? undefined);
  return c.json(success(rows), 200);
});

// ─── POST / — create request ───────────────────────────────────────────
coffeeRoutes.post("/", validateJson(CreateCoffeeRequestSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);

  const body = c.req.valid("json");

  // The service gates on the recipient's openToCoffee profile section.
  const service = buildCoffeeService(requestEnv(c));
  const result = await service.create(userId, body);
  if ("error" in result) {
    if (result.error === "recipient_not_found") return c.json(error("NOT_FOUND", "Recipient not found"), 404);
    if (result.error === "not_open") {
      return c.json(
        error(
          "FORBIDDEN",
          "This person isn't open to coffee invites right now. Try Connect or Message instead.",
        ),
        403,
      );
    }
    if (result.error === "self") return c.json(error("BAD_REQUEST", "Cannot request coffee with yourself"), 400);
    if (result.error === "duplicate")
      return c.json(error("CONFLICT", "You already have a pending coffee request with this person"), 409);
  }
  return c.json(success(result), 201);
});

// ─── PATCH /:id — accept / decline ─────────────────────────────────────
coffeeRoutes.patch("/:id", validateJson(RespondCoffeeRequestSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);

  const body = c.req.valid("json");

  const service = buildCoffeeService(requestEnv(c));
  const result = await service.respond(c.req.param("id"), userId, body);
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
  const userId = requireUser(c);

  const service = buildCoffeeService(requestEnv(c));
  const ok = await service.cancel(c.req.param("id"), userId);
  if (!ok) return c.json(error("FORBIDDEN", "Cannot cancel this request"), 403);
  return c.json(success({ cancelled: true }), 200);
});
