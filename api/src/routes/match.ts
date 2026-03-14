import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
export const matchRoutes = new Hono<{ Variables: Variables }>();

const defaultMatch = {
	summaryRecommendations: "No recommendations yet.",
	score: 0,
};

matchRoutes.post("/", async (c) => c.json(success(defaultMatch), 200));
matchRoutes.post("/byid", async (c) => c.json(success(defaultMatch), 200));
matchRoutes.post("/bycontent", async (c) => c.json(success(defaultMatch), 200));
matchRoutes.post("/analyze", async (c) => c.json(success(defaultMatch), 200));
matchRoutes.post("/tailor", async (c) =>
	c.json(
		success({
			markdownResume: "",
			summaryRecommendations: "No recommendations yet.",
			oldScore: 0,
			newScore: 0,
		}),
		200,
	),
);

matchRoutes.all("*", (c) =>
	c.json({ error: { code: "NOT_IMPLEMENTED", message: "Match routes coming soon" } }, 501),
);
