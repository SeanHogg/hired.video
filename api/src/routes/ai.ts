import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const aiRoutes = new Hono<{ Variables: Variables }>();
aiRoutes.all("*", (c) => c.json({ error: { code: "NOT_IMPLEMENTED", message: "AI routes coming soon" } }, 501));
