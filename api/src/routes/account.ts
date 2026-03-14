import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const accountRoutes = new Hono<{ Variables: Variables }>();
accountRoutes.all("*", (c) => c.json({ error: { code: "NOT_IMPLEMENTED", message: "Account routes coming soon" } }, 501));
