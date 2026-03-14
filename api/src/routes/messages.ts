import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
export const messageRoutes = new Hono<{ Variables: Variables }>();

messageRoutes.post("/", async (c) =>
	c.json(success([]), 200),
);

// Frontend AI service calls /api/chat/message in the legacy API.
// We map it under /api/messages/message and also mount /api/chat in app.ts.
messageRoutes.post("/message", async (c) => {
	const body = await c.req.json().catch(() => ({}));
	return c.json(
		success({
			message: "AI chat is currently stubbed.",
			usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
		}),
		200,
	);
});

messageRoutes.all("*", (c) =>
	c.json({ error: { code: "NOT_IMPLEMENTED", message: "Message routes coming soon" } }, 501),
);
