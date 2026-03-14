import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const marketingRoutes = new Hono<{ Variables: Variables }>();

function ok<T>(data: T) {
	return { success: true as const, data, timestamp: new Date().toISOString() };
}

marketingRoutes.get("/campaigns", (c) => c.json(ok([]), 200));
marketingRoutes.post("/campaigns", async (c) => {
	const body = await c.req.json().catch(() => ({}));
	return c.json(ok({ id: crypto.randomUUID(), ...body }), 201);
});
marketingRoutes.get("/leads", (c) => c.json(ok([]), 200));
marketingRoutes.post("/leads", async (c) => {
	const body = await c.req.json().catch(() => ({}));
	return c.json(ok({ id: crypto.randomUUID(), ...body }), 201);
});

marketingRoutes.all("*", (c) =>
	c.json(
		{
			success: false,
			error: { code: "NOT_IMPLEMENTED", message: "Marketing route not implemented" },
			timestamp: new Date().toISOString(),
		},
		501,
	),
);
