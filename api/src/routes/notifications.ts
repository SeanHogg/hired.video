import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const notificationRoutes = new Hono<{ Variables: Variables }>();
notificationRoutes.all("*", (c) => c.json({ error: { code: "NOT_IMPLEMENTED", message: "Notification routes coming soon" } }, 501));
