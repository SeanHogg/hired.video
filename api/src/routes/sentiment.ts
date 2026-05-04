import { Hono } from "hono";
import { success } from "../types/index.js";
import { scoreSentiment } from "../../../shared/sentiment.js";

export const sentimentRoutes = new Hono();

/**
 * Coerce any inbound body into the text we're scoring. Frontend sends
 * `JSON.stringify(text)` (a JSON string), but we still tolerate raw
 * objects and null for legacy probes.
 */
function bodyAsText(body: unknown): string {
  if (typeof body === "string") return body;
  if (body == null) return "";
  return JSON.stringify(body);
}

sentimentRoutes.post("/sentimentprediction", async (c) => {
  const body = await c.req.json().catch(() => "");
  return c.json(success({ score: scoreSentiment(bodyAsText(body)) }), 200);
});

// Legacy alias for requests that become /sentiment/resume/sentimentprediction
sentimentRoutes.post("/resume/sentimentprediction", async (c) => {
  const body = await c.req.json().catch(() => "");
  return c.json(success({ score: scoreSentiment(bodyAsText(body)) }), 200);
});

sentimentRoutes.all("*", (c) =>
  c.json(
    { success: false as const, error: { code: "NOT_IMPLEMENTED", message: "Sentiment route not implemented" }, timestamp: new Date().toISOString() },
    501,
  ),
);
