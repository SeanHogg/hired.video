import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const dashboardRoutes = new Hono<{ Variables: Variables }>();
dashboardRoutes.all("*", (c) => c.json({ error: { code: "NOT_IMPLEMENTED", message: "Dashboard routes coming soon" } }, 501));
