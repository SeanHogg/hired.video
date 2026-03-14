import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const affiliateRoutes = new Hono<{ Variables: Variables }>();
affiliateRoutes.all("*", (c) => c.json({ error: { code: "NOT_IMPLEMENTED", message: "Affiliate routes coming soon" } }, 501));
