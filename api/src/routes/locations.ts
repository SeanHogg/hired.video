import { Hono } from "hono";
import type { Variables } from "../types/index.js";
export const locationRoutes = new Hono<{ Variables: Variables }>();

function ok<T>(data: T) {
	return { success: true as const, data, timestamp: new Date().toISOString() };
}

locationRoutes.get("/search", (c) => {
	const query = (c.req.query("q") ?? "").trim();
	if (!query) return c.json(ok([]), 200);
	return c.json(
		ok([
			{
				id: `loc-${query.toLowerCase().replace(/\s+/g, "-")}`,
				name: query,
				city: query,
				state: "",
				country: "",
			},
		]),
		200,
	);
});

locationRoutes.get("/countries", (c) => c.json(ok([]), 200));
locationRoutes.get("/states", (c) => c.json(ok([]), 200));
locationRoutes.get("/cities", (c) => c.json(ok([]), 200));

locationRoutes.all("*", (c) =>
	c.json(
		{
			success: false,
			error: { code: "NOT_IMPLEMENTED", message: "Location route not implemented" },
			timestamp: new Date().toISOString(),
		},
		501,
	),
);
