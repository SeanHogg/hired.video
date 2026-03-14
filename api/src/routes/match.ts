import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const matchRoutes = new Hono<{ Variables: Variables }>();
matchRoutes.all("*", (c) => c.json({ error: { code: "NOT_IMPLEMENTED", message: "Match routes coming soon" } }, 501));
