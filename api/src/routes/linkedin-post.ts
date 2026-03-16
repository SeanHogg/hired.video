// linkedin-post.ts — POST /api/studio/linkedin-post
// Generates a LinkedIn post package (hook, caption, hashtags, fullPost) using
// the OpenRouter LLM. Falls back to a deterministic mock when the key is absent.

import { Hono } from "hono";
import { z } from "zod";
import type { Variables } from "../types/index.js";

export const linkedInPostRoutes = new Hono<{ Variables: Variables }>();

const RequestSchema = z.object({
  videoId:    z.string(),
  videoTitle: z.string().optional(),
  ownerName:  z.string().optional(),
  highlights: z.array(z.string()).optional(), // pulled from script scenes
});

function buildMockPost(videoId: string, videoTitle?: string) {
  const title = videoTitle ?? "My Video Resume";
  const url = `https://hired.video/v/${videoId}`;
  const hook = `🎬 I just created a video resume that says more in 30 seconds than a page of bullet points.`;
  const caption = [
    hook,
    "",
    "Here's what I covered:",
    "• My background and current role",
    "• Key achievements with real numbers",
    "• The skills I bring to the table",
    "",
    `Watch it here → ${url}`,
    "",
    `Created with hired.video ✨`,
  ].join("\n");

  return {
    hook,
    caption:  `${title}\n\n${hook}`,
    hashtags: ["videoResume", "hiring", "jobSearch", "career", "openToWork"],
    fullPost: caption,
  };
}

async function callOpenRouterLinkedIn(
  env: { OPENROUTER_API_KEY?: string },
  videoId: string,
  videoTitle?: string,
  ownerName?: string,
) {
  if (!env.OPENROUTER_API_KEY) return null;

  const url = `https://hired.video/v/${videoId}`;
  const systemPrompt = `You are a LinkedIn copywriter specialist. Write an engaging LinkedIn post for someone who just created a video resume.
Rules:
- 3-line hook (curiosity/story/achievement)
- 4-bullet caption with real-sounding accomplishments
- 3–5 hashtags (no spaces)
- Always end with: "Created with hired.video ✨"
- Keep total under 1300 characters
Return ONLY a JSON object: { hook, caption, hashtags: string[], fullPost }`;

  const userMsg = `Name: ${ownerName ?? "the user"}
Video title: ${videoTitle ?? "Video Resume"}
Public URL: ${url}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://hired.video",
    },
    body: JSON.stringify({
      model: "google/gemini-flash-1.5",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMsg },
      ],
    }),
  });

  if (!res.ok) return null;

  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as { hook: string; caption: string; hashtags: string[]; fullPost: string };
  } catch {
    return null;
  }
}

linkedInPostRoutes.post("/linkedin-post", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Bad request" } }, 400);
  }

  const { videoId, videoTitle, ownerName } = parsed.data;
  const env = c.env as { OPENROUTER_API_KEY?: string };

  const llmResult = await callOpenRouterLinkedIn(env, videoId, videoTitle, ownerName).catch(() => null);
  const post = llmResult ?? buildMockPost(videoId, videoTitle);

  return c.json({ success: true, data: post, timestamp: new Date().toISOString() });
});
