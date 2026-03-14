import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const adminRoutes = new Hono<{ Variables: Variables }>();
adminRoutes.all("*", (c) => c.json({ error: { code: "NOT_IMPLEMENTED", message: "Admin routes coming soon" } }, 501));
