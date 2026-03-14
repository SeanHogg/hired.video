import { Hono } from "hono";

export const sentimentRoutes = new Hono();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

sentimentRoutes.post("/sentimentprediction", async (c) => {
  const body = await c.req.json().catch(() => "");
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  const score = text.length > 300 ? 85 : text.length > 120 ? 70 : 55;
  return c.json(ok(score), 200);
});

// Legacy alias for requests that become /sentiment/resume/sentimentprediction
sentimentRoutes.post("/resume/sentimentprediction", async (c) => {
  const body = await c.req.json().catch(() => "");
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  const score = text.length > 300 ? 85 : text.length > 120 ? 70 : 55;
  return c.json(ok(score), 200);
});

sentimentRoutes.all("*", (c) =>
  c.json(
    { success: false, error: { code: "NOT_IMPLEMENTED", message: "Sentiment route not implemented" }, timestamp: new Date().toISOString() },
    501,
  ),
);
