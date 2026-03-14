import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const settingsRoutes = new Hono<{ Variables: Variables }>();
settingsRoutes.all("*", (c) => c.json({ error: { code: "NOT_IMPLEMENTED", message: "Settings routes coming soon" } }, 501));
