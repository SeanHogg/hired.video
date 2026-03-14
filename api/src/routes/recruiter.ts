import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const recruiterRoutes = new Hono<{ Variables: Variables }>();
recruiterRoutes.all("*", (c) => c.json({ error: { code: "NOT_IMPLEMENTED", message: "Recruiter routes coming soon" } }, 501));
