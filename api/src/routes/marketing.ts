import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const marketingRoutes = new Hono<{ Variables: Variables }>();
marketingRoutes.all("*", (c) => c.json({ error: { code: "NOT_IMPLEMENTED", message: "Marketing routes coming soon" } }, 501));
