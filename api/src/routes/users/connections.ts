/**
 * `/api/users` connection endpoints (viewer-scoped). Mounted BEFORE the
 * profile router so `GET /me/connections` wins over `GET /:id/connections`.
 *   POST /connections · GET /me/connections[/cards|/search|/pending] ·
 *   PUT /connections/:id/accept · DELETE /connections/:id ·
 *   GET /connections/status · POST /connections/statuses
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { clampLimit } from "../../utils/pagination.js";
import { gamificationFromContext } from "../../domains/gamification/with-gamification.js";
import {
  SendConnectionRequestSchema,
  acceptConnection,
  getConnectionStatus,
  getConnectionStatuses,
  listAcceptedConnections,
  listConnectionCards,
  listPendingConnections,
  removeConnection,
  searchConnectionCards,
  sendConnectionRequest,
} from "../../services/user/connections.js";
import { domainErrorResponse, respond, validationError } from "./http.js";
import { validateJson } from "../helpers/validate.js";

export const connectionRoutes = new Hono<AppEnv>();

/** POST /api/users/connections — send connection request (200 when it already exists) */
connectionRoutes.post("/connections", validateJson(SendConnectionRequestSchema, (e, c) => validationError(c, "Invalid request body", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  try {
    const { status, connection } = await sendConnectionRequest(c.var.userId, body);
    return c.json(success(connection), status);
  } catch (err) {
    return domainErrorResponse(c, err);
  }
});

/** GET /api/users/me/connections */
connectionRoutes.get("/me/connections", (c) => respond(c, listAcceptedConnections(c.var.userId)));

/** GET /api/users/me/connections/cards — the viewer's accepted connections as
 *  People cards (#802), same shape as the Discover grid. */
connectionRoutes.get("/me/connections/cards", async (c) =>
  c.json(success({ items: await listConnectionCards(c.var.userId) }), 200),
);

/** GET /api/users/me/connections/search?q=&limit= — server-side typeahead over
 *  the viewer's accepted connections (≤ limit cards, cap 50, ordered by name). */
connectionRoutes.get("/me/connections/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const limit = clampLimit(c.req.query("limit"), 20, 50);
  return c.json(success({ items: await searchConnectionCards(c.var.userId, q, limit) }), 200);
});

/** GET /api/users/me/connections/pending */
connectionRoutes.get("/me/connections/pending", (c) => respond(c, listPendingConnections(c.var.userId)));

/** PUT /api/users/connections/:id/accept */
connectionRoutes.put("/connections/:id/accept", (c) =>
  respond(c, acceptConnection(c.req.param("id"), c.var.userId, () => gamificationFromContext(c))),
);

/** DELETE /api/users/connections/:id */
connectionRoutes.delete("/connections/:id", (c) =>
  respond(c, removeConnection(c.req.param("id"), c.var.userId)),
);

/** GET /api/users/connections/status */
connectionRoutes.get("/connections/status", (c) =>
  respond(c, getConnectionStatus(c.req.query("fromUserId") ?? "", c.req.query("toUserId") ?? "")),
);

/** POST /api/users/connections/statuses — batch lookup */
connectionRoutes.post("/connections/statuses", async (c) => {
  const body = await c.req.json<{ userIds: string[] }>();
  return respond(c, getConnectionStatuses(c.var.userId, body.userIds ?? []));
});
