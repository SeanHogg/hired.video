import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const notificationRoutes = new Hono<{ Variables: Variables }>();

function ok<T>(data: T) {
	return { success: true as const, data, timestamp: new Date().toISOString() };
}

notificationRoutes.get("/", (c) => c.json(ok([]), 200));
notificationRoutes.get("/unread-count", (c) => c.json(ok({ count: 0 }), 200));
notificationRoutes.post("/mark-all-read", (c) => c.json(ok({ success: true }), 200));
notificationRoutes.post("/:id/mark-read", (c) => c.json(ok({ success: true }), 200));
notificationRoutes.delete("/:id", (c) => c.json(ok({ success: true }), 200));

notificationRoutes.all("*", (c) =>
	c.json(
		{
			success: false,
			error: { code: "NOT_IMPLEMENTED", message: "Notification route not implemented" },
			timestamp: new Date().toISOString(),
		},
		501,
	),
);
