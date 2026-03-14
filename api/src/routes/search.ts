import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const searchRoutes = new Hono<{ Variables: Variables }>();
searchRoutes.all("*", (c) => c.json({ error: { code: "NOT_IMPLEMENTED", message: "Search routes coming soon" } }, 501));
