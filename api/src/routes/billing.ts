import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const billingRoutes = new Hono<{ Variables: Variables }>();
billingRoutes.all("*", (c) => c.json({ error: { code: "NOT_IMPLEMENTED", message: "Billing routes coming soon" } }, 501));
