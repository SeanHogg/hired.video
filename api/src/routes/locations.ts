import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const locationRoutes = new Hono<{ Variables: Variables }>();
locationRoutes.all("*", (c) => c.json({ error: { code: "NOT_IMPLEMENTED", message: "Location routes coming soon" } }, 501));
