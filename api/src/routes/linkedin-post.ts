// linkedin-post.ts — POST /api/studio/linkedin-post
// Generates a LinkedIn post package (hook, caption, hashtags, fullPost) using
// the OpenRouter LLM. Falls back to a deterministic mock when the key is absent.

import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types/index.js";
import { callLLMJson, getApiKey } from "../services/adapters/ai.js";

export const linkedInPostRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

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

const LinkedInResponseSchema = z.object({
  hook: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  fullPost: z.string(),
});

linkedInPostRoutes.post("/linkedin-post", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Bad request" } }, 400);
  }

  const { videoId, videoTitle, ownerName } = parsed.data;
  const apiKey = getApiKey(c.env);

  let post: ReturnType<typeof buildMockPost>;
  if (apiKey) {
    const url = `https://hired.video/v/${videoId}`;
    const systemPrompt = `You are a LinkedIn copywriter specialist. Write an engaging LinkedIn post for someone who just created a video resume.
Rules:
- 3-line hook (curiosity/story/achievement)
- 4-bullet caption with real-sounding accomplishments
- 3–5 hashtags (no spaces)
- Always end with: "Created with hired.video ✨"
- Keep total under 1300 characters
Return ONLY a JSON object: { hook, caption, hashtags: string[], fullPost }`;
    const userMessage = `Name: ${ownerName ?? "the user"}\nVideo title: ${videoTitle ?? "Video Resume"}\nPublic URL: ${url}`;
    post = await callLLMJson(apiKey, { useCase: "linkedin_post", systemPrompt, userMessage }, LinkedInResponseSchema).catch(() => buildMockPost(videoId, videoTitle));
  } else {
    post = buildMockPost(videoId, videoTitle);
  }

  return c.json({ success: true, data: post, timestamp: new Date().toISOString() });
});
