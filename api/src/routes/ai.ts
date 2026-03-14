import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
export const aiRoutes = new Hono<{ Variables: Variables }>();

aiRoutes.post("/context", async (c) => {
	const body = await c.req.json().catch(() => ({}));
	return c.json(
		success({
			message: "AI context processing is currently stubbed.",
			action: body?.action,
			contextType: body?.context?.contextType,
			usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
		}),
		200,
	);
});

aiRoutes.all("*", (c) =>
	c.json({ error: { code: "NOT_IMPLEMENTED", message: "AI routes coming soon" } }, 501),
);
