import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const companyRoutes = new Hono<{ Variables: Variables }>();
companyRoutes.all("*", (c) => c.json({ error: { code: "NOT_IMPLEMENTED", message: "Company routes coming soon" } }, 501));
