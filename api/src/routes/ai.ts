import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
export const aiRoutes = new Hono<{ Variables: Variables }>();

function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

function generateMockResponse(input: string) {
  const normalized = (input ?? "").toLowerCase();

  let message = "I'm here to help! Tell me what you'd like to do, and I'll guide you through it.";

  if (normalized.includes("resume") || normalized.includes("cv")) {
    message =
      "I can help optimize your resume for ATS and hiring managers. Share your goals and I'll suggest improvements.";
  } else if (normalized.includes("job") || normalized.includes("career") || normalized.includes("position")) {
    message =
      "Looking for a job? I can help you discover opportunities, tailor applications, and optimize your profile for recruiters.";
  } else if (normalized.includes("recruit") || normalized.includes("hire") || normalized.includes("talent")) {
    message =
      "As a recruiter, I can help you source candidates, craft outreach messages, and track hiring progress.";
  } else if (normalized.includes("analytics") || normalized.includes("data") || normalized.includes("metrics")) {
    message =
      "I can analyze your hiring data and help you interpret key metrics like time-to-hire, conversion rates, and engagement.";
  } else if (normalized.includes("help") || normalized.includes("how") || normalized.includes("what")) {
    message =
      "Ask me anything about hiring, job searching, or resume building and I'll do my best to help.";
  }

  const promptTokens = estimateTokens(input);
  const completionTokens = estimateTokens(message);

  return {
    message,
    usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
  };
}

aiRoutes.post("/context", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const userMessage = typeof body?.message === "string" ? body.message : "";
  const response = generateMockResponse(userMessage);

  return c.json(
    success({
      message: response.message,
      action: body?.action,
      contextType: body?.context?.contextType,
      usage: response.usage,
    }),
    200,
  );
});

aiRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_IMPLEMENTED", message: "AI routes coming soon" } }, 501),
);

