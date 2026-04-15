import { Hono } from "hono";
import { success } from "../types/index.js";

export const sentimentRoutes = new Hono();

// Pure scoring so both handlers stay in sync and the unit test can
// exercise the same function as production.
function scoreSentiment(body: unknown): number {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  return text.length > 300 ? 85 : text.length > 120 ? 70 : 55;
}

sentimentRoutes.post("/sentimentprediction", async (c) => {
  const body = await c.req.json().catch(() => "");
  // `data` is always an object (not a raw number) — consistent envelope
  // across all tool endpoints; see roadmap #147.
  return c.json(success({ score: scoreSentiment(body) }), 200);
});

// Legacy alias for requests that become /sentiment/resume/sentimentprediction
sentimentRoutes.post("/resume/sentimentprediction", async (c) => {
  const body = await c.req.json().catch(() => "");
  return c.json(success({ score: scoreSentiment(body) }), 200);
});

sentimentRoutes.all("*", (c) =>
  c.json(
    { success: false as const, error: { code: "NOT_IMPLEMENTED", message: "Sentiment route not implemented" }, timestamp: new Date().toISOString() },
    501,
  ),
);
