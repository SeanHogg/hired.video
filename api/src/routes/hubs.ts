import { Hono } from "hono";
import type { Variables } from "../types/index.js";

export const hubsRoutes = new Hono<{ Variables: Variables }>();

function notSupported(c: Parameters<typeof hubsRoutes.get>[1] extends (arg: infer T) => any ? T : any) {
  return c.json(
    {
      success: false,
      error: {
        code: "NOT_IMPLEMENTED",
        message: "SignalR hubs are not implemented in the Worker API yet.",
      },
      timestamp: new Date().toISOString(),
    },
    501,
  );
}

// SignalR clients call POST /api/hubs/notifications/negotiate first.
hubsRoutes.post("/notifications/negotiate", (c) => notSupported(c));

// WebSocket/SSE upgrade target used by SignalR.
hubsRoutes.get("/notifications", (c) => notSupported(c));
hubsRoutes.post("/notifications", (c) => notSupported(c));

hubsRoutes.all("*", (c) => notSupported(c));
