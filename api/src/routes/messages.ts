import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const messageRoutes = new Hono<{ Variables: Variables }>();
messageRoutes.all("*", (c) => c.json({ error: { code: "NOT_IMPLEMENTED", message: "Message routes coming soon" } }, 501));
